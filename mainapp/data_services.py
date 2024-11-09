from typing import List, Dict, Optional, Tuple
import json
import logging
from .models import SystemPrompt, CleaningDimension, LabelingDimension
from .ai_services import AIServiceBase
import re 
from datetime import datetime
import time
from django.core.cache import cache
logger = logging.getLogger(__name__)

class TextProcessor:
    """文本处理服务"""
    
    def __init__(self, service: AIServiceBase):
        self.service = service
        self.max_chunk_size = 3072
        self.request_timeout = 180  # 3分钟超时
        self.cache = {}  # 用于临时存储处理结果
        logger.info(f"初始化TextProcessor: max_chunk_size={self.max_chunk_size}, timeout={self.request_timeout}")
 

    def _split_text(self, content: str) -> List[str]:
        """文本分块"""
        chunks = []
        sentences = re.split('([。！？.!?])', content)
        current_chunk = ''
        
        for i in range(0, len(sentences), 2):
            sentence = sentences[i] + (sentences[i + 1] if i + 1 < len(sentences) else '')
            if len(current_chunk) + len(sentence) <= self.max_chunk_size:
                current_chunk += sentence
            else:
                if current_chunk:
                    chunks.append(current_chunk)
                current_chunk = sentence
                
        if current_chunk:
            chunks.append(current_chunk)
            
        return chunks

    def process_content(self, content: str, process_type: str, dimensions: List[str], processing_key: str) -> Optional[str]:
        """处理完整内容，支持分块处理"""
        try:
            # 获取系统提示词和JSON schema
            system_prompt = self._get_system_prompt(process_type, dimensions)
            if not system_prompt:
                raise Exception("获取系统提示词失败")
                
            logger.info(f"使用系统提示词:\n{system_prompt}")
            
            # 分割文本
            chunks = self._split_text(content)
            total_chunks = len(chunks)
            logger.info(f"文本已分割为 {total_chunks} 个块")
            
            all_results = []
            for i, chunk in enumerate(chunks, 1):
                try:
                    logger.info(f"\n{'='*40} 处理第 {i}/{total_chunks} 个文本块 {'='*40}")
                    logger.info(f"块大小: {len(chunk)} 字符")
                    logger.info(f"块内容预览:\n{chunk[:200]}...")
                    
                    # 构建消息
                    messages = [
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": chunk}
                    ]
                    
                    # 调用AI服务
                    response = self.service.chat_completion(
                        messages=messages,
                        task_type=process_type
                    )
                    
                    if response:
                        logger.info(f"AI响应预览:\n{response[:200]}...")
                        result = self._parse_json_response(response)
                        all_results.append(result)
                        
                        # 更新缓存中的进度
                        progress = (i / total_chunks) * 100
                        cache.set(processing_key, {
                            'status': 'processing',
                            'progress': progress,
                            'partial_results': all_results,
                            'timestamp': datetime.now().isoformat()
                        }, timeout=3600)
                        
                        logger.info(f"当前处理进度: {progress:.1f}%")
                    
                except Exception as e:
                    logger.error(f"处理块 {i} 失败: {str(e)}")
                    continue
                    
            if not all_results:
                raise Exception("没有成功处理任何文本块")
                
            # 合并所有结果
            final_result = json.dumps(all_results, ensure_ascii=False, indent=2)
            logger.info(f"处理完成，最终结果预览:\n{final_result[:200]}...")
            
            # 更新缓存为完成状态
            cache.set(processing_key, {
                'status': 'completed',
                'result': final_result,
                'timestamp': datetime.now().isoformat()
            }, timeout=3600)
            
            return final_result
            
        except Exception as e:
            logger.error(f"处理内容失败: {str(e)}")
            return None

    def _get_system_prompt(self, process_type: str, dimensions: List[str]) -> Optional[str]:
        """获取系统提示词"""
        try:
            # 获取默认提示词
            prompt = SystemPrompt.objects.get(type=process_type, is_default=True)
            
            # 获取维度名称
            if process_type == 'cleaning':
                dimension_objects = CleaningDimension.objects.filter(id__in=dimensions)
            else:
                dimension_objects = LabelingDimension.objects.filter(id__in=dimensions)
                
            dimension_names = [d.name for d in dimension_objects]
            logger.info(f"使用维度: {', '.join(dimension_names)}")
            
            # 组合提示词：原始提示词 + 维度说明
            system_prompt = f"{prompt.content}\n提供的维度: {', '.join(dimension_names)}"
            
            # 如果有 JSON schema，添加到提示词中
            if prompt.json_schema:
                system_prompt = f"{system_prompt}\n使用示例:{prompt.json_schema}"
                
            logger.info(f"系统提示词:\n{system_prompt}")
            return system_prompt
            
        except Exception as e:
            logger.error(f"获取系统提示词失败: {str(e)}")
            return None

    def _parse_json_response(self, response: str) -> Dict:
        """解析 AI 返回的响应"""
        try:
            # 首先尝试直接解析完整 JSON
            return json.loads(response)
        except json.JSONDecodeError:
            try:
                # 如果失败，尝试清理响应中的 markdown 标记
                cleaned_response = response.strip()
                if cleaned_response.startswith('```json'):
                    cleaned_response = cleaned_response[7:]
                if cleaned_response.endswith('```'):
                    cleaned_response = cleaned_response[:-3]
                cleaned_response = cleaned_response.strip()
                
                # 尝试解析清理后的响应
                return json.loads(cleaned_response)
            except json.JSONDecodeError:
                try:
                    # 如果还是失败，尝试将多个 JSON 对象合并为数组
                    results = []
                    for line in cleaned_response.split('\n'):
                        line = line.strip()
                        if line and not line.startswith('{'):
                            continue
                        try:
                            results.append(json.loads(line))
                        except:
                            continue
                    if results:
                        return results
                    raise ValueError("无法解析任何 JSON 对象")
                except Exception as e:
                    logger.error(f"JSON 解析失败: {str(e)}")
                    logger.debug(f"原始响应:\n{response}")
                    raise

    def get_cached_result(self, processing_key: str) -> Optional[Dict]:
        """获取缓存的处理结果"""
        return self.cache.get(processing_key)
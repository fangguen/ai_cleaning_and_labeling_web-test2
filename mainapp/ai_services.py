from abc import ABC, abstractmethod
import json
import logging
from openai import OpenAI
from typing import List, Dict, Optional
import time
import requests
from requests.adapters import HTTPAdapter
from urllib3.util import Retry
from zhipuai import ZhipuAI
from django.conf import settings

logger = logging.getLogger(__name__)

class AIServiceBase(ABC):
    """AI服务基类"""
    
    def __init__(self, api_key: str):
        self.api_key = api_key
        self.max_tokens = 3072
        self.timeout = 180  # 3分钟超时
        logger.info(f"初始化AI服务: max_tokens={self.max_tokens}, timeout={self.timeout}")
        self.session = self._create_session()
        # 为不同任务设置不同的 temperature
        self.task_temperatures = {
            'cleaning': 0.2,  # 清洗任务需要更确定的输出
            'labeling': 0.2,  # 标注任务需要高度一致性
            'chat': 0.9      # 聊天需要更有创意的回复
        }

    def _create_session(self):
        """创建带有重试机制的会话"""
        session = requests.Session()
        retry_strategy = Retry(
            total=3,  # 最多重试3次
            backoff_factor=2,  # 增加重试间隔
            status_forcelist=[429, 500, 502, 503, 504],
            allowed_methods=["GET", "POST"]  # 明确允许的方法
        )
        adapter = HTTPAdapter(max_retries=retry_strategy)
        session.mount("https://", adapter)
        session.mount("http://", adapter)
        return session

    def _handle_rate_limit(self, response: requests.Response) -> None:
        """处理速率限制"""
        if response.status_code == 429:
            retry_after = int(response.headers.get('Retry-After', 5))
            time.sleep(retry_after)

    @abstractmethod
    def chat_completion(self, messages: List[Dict], task_type: str = 'chat') -> Optional[str]:
        """发送聊天请求"""
        pass

    @abstractmethod
    def validate_api_key(self) -> bool:
        """验证API密钥是否有效"""
        pass

class DeepseekService(AIServiceBase):
    """Deepseek API服务"""
    
    def __init__(self, api_key: str):
        super().__init__(api_key)
        self.client = OpenAI(
            api_key=api_key,
            base_url=settings.DEEPSEEK_API_BASE,
        )
        self.model = "deepseek-chat"

    def chat_completion(self, messages: List[Dict], task_type: str = 'chat') -> Optional[str]:
        try:
            logger.info(f"调用Deepseek API: task_type={task_type}")
            logger.info(f"请求消息:\n{json.dumps(messages, ensure_ascii=False, indent=2)}")
            
            response = self.client.chat.completions.create(
                model=self.model,
                messages=messages,
                temperature=self.task_temperatures.get(task_type, 0.8),
                max_tokens=self.max_tokens
            )
            
            result = response.choices[0].message.content
            logger.info(f"Deepseek响应:\n{result}")
            return result
            
        except Exception as e:
            logger.error(f"Deepseek API调用失败: {str(e)}")
            return None

    def validate_api_key(self) -> bool:
        try:
            response = self.chat_completion([{"role": "user", "content": "test"}])
            return response is not None
        except Exception:
            return False

class ZhipuService(AIServiceBase):
    """智谱 AI 服务"""
    
    def __init__(self, api_key: str):
        super().__init__(api_key)
        self.client = ZhipuAI(api_key=api_key)
        self.model = "glm-4-plus"
        self.max_retries = 2
        logger.info(f"初始化智谱AI服务: model={self.model}")

    def chat_completion(self, messages: List[Dict], task_type: str = 'chat') -> Optional[str]:
        """发送聊天请求"""
        try:
            logger.info(f"调用智谱API: model={self.model}, task_type={task_type}")
            logger.info(f"请求消息:\n{json.dumps(messages, ensure_ascii=False, indent=2)}")
            
            response = self.client.chat.completions.create(
                model=self.model,
                messages=messages,
                temperature=self.task_temperatures.get(task_type, 0.8),
                max_tokens=self.max_tokens
            )
            
            result = response.choices[0].message.content
            logger.info(f"智谱API响应:\n{result}")
            return result
            
        except Exception as e:
            logger.error(f"智谱API调用失败: {str(e)}")
            return None

    def validate_api_key(self) -> bool:
        """验证API密钥是否有效"""
        try:
            response = self.chat_completion(
                messages=[{"role": "user", "content": "测试"}],
                task_type='chat'
            )
            return response is not None
        except Exception as e:
            logger.error(f"API密钥验证失败: {str(e)}")
            return False

class OpenAIService(AIServiceBase):
    """OpenAI API服务"""
    
    def __init__(self, api_key: str, base_url: str = None):
        super().__init__(api_key)
        self.client = OpenAI(
            api_key=api_key,
            base_url=base_url or settings.OPENAI_API_BASE
        )
        self.model = "chatgpt-4o-latest"

    def chat_completion(self, messages: List[Dict], task_type: str = 'chat') -> Optional[str]:
        try:
            logger.info(f"调用OpenAI API: model={self.model}, task_type={task_type}")
            logger.info(f"请求消息:\n{json.dumps(messages, ensure_ascii=False, indent=2)}")
            
            response = self.client.chat.completions.create(
                model=self.model,
                messages=messages,
                temperature=self.task_temperatures.get(task_type, 0.8),
                max_tokens=self.max_tokens
            )
            
            result = response.choices[0].message.content
            logger.info(f"OpenAI响应:\n{result}")
            return result
            
        except Exception as e:
            logger.error(f"OpenAI API调用失败: {str(e)}")
            return None

    def validate_api_key(self) -> bool:
        try:
            response = self.chat_completion([{"role": "user", "content": "test"}])
            return response is not None
        except:
            return False

def create_ai_service(service_type, api_key, base_url=None):
    """创建 AI 服务实例"""
    if service_type == 'openai':
        return OpenAIService(api_key, base_url)
    elif service_type == 'zhipu':
        return ZhipuService(api_key)
    elif service_type == 'deepseek':
        return DeepseekService(api_key)
    else:
        raise ValueError(f'不支持的服务类型: {service_type}')

class AIServiceFactory:
    """AI服务工厂类"""
    
    @staticmethod
    def create_service(service_type: str, api_key: str, base_url: str = None) -> Optional[AIServiceBase]:
        """
        创建AI服务实例
        :param service_type: 服务类型 ('deepseek', 'zhipu', 'openai')
        :param api_key: API密钥
        :param base_url: OpenAI Base URL（仅用于 'openai' 服务）
        :return: AI服务实例
        """
        try:
            if not service_type or not api_key:
                logger.error("服务类型或API密钥为空")
                return None

            if service_type == 'openai':
                return OpenAIService(api_key, base_url)
            elif service_type == 'zhipu':
                return ZhipuService(api_key)
            elif service_type == 'deepseek':
                return DeepseekService(api_key)
            else:
                logger.error(f"不支持的服务类型: {service_type}")
                return None
        except Exception as e:
            logger.error(f"创建AI服务失败: {str(e)}")
            return None

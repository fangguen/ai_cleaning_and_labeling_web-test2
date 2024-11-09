from django.core.cache import cache
from django.db.models import Q
from .models import APIConfig, ChatMessage, SystemPrompt
from .ai_services import AIServiceFactory
import logging
from typing import Optional
from .exceptions import AIWebException 

logger = logging.getLogger(__name__)

class ChatService:
    def __init__(self, api_config: APIConfig):
        """
        初始化聊天服务
        :param api_config: APIConfig 实例
        """
        if not api_config:
            raise AIWebException("API配置不能为空")
            
        self.api_config = api_config
        self.service = AIServiceFactory.create_service(
            service_type=api_config.service_type,
            api_key=api_config.api_key,
            base_url=api_config.base_url
        )
        
        if not self.service:
            raise AIWebException("创建AI服务失败")
            
        # 获取默认的聊天系统提示词
        self.system_prompt = SystemPrompt.objects.filter(
            type='chat',
            is_default=True
        ).first()

    def process_message(self, message: str, session_id: str = 'default') -> dict:
        """
        处理聊天消息
        :param message: 用户消息
        :param session_id: 会话ID
        :return: 处理结果
        """
        try:
            # 使用系统提示词（如果存在）
            system_content = self.system_prompt.content if self.system_prompt else None
            
            # 获取历史消息，使用 Q 对象组合多个条件
            history = ChatMessage.objects.filter(
                session_id=session_id
            ).filter(
                ~Q(content__contains='API验证') & 
                ~Q(content__contains='test')
            ).order_by('timestamp')[:10]  # 限制历史消息数量
            
            messages = []
            if system_content:
                messages.append({"role": "system", "content": system_content})
            
            # 添加历史消息，确保是有效的对话内容
            for msg in history:
                if msg.content.strip():  # 确保消息不是空的
                    messages.append({
                        "role": msg.role,
                        "content": msg.content
                    })
            
            # 添加当前消息
            messages.append({"role": "user", "content": message})
            
            # 调用AI服务
            response = self.service.chat_completion(messages)
            
            return {
                'reply': response,
                'status': 'success',
                'tokens_used': len(message + response) // 4,  # 估算token数
                'max_tokens': self.service.max_tokens
            }
            
        except Exception as e:
            logger.error(f"处理消息错误: {str(e)}", exc_info=True)
            raise AIWebException(f"处理消息失败: {str(e)}")

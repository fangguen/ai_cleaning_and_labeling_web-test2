from django.db import models
from django.contrib.auth.models import User
from django.core.cache import cache
from django.db.models.signals import post_migrate
from django.dispatch import receiver
from django.core.exceptions import ValidationError
import json
import logging

# Create your models here.

logger = logging.getLogger(__name__)

class APIConfig(models.Model):
    service_type = models.CharField(max_length=20)  # 'openai', 'zhipu', 'deepseek'
    api_key = models.CharField(max_length=255)
    base_url = models.CharField(max_length=255, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        db_table = 'api_config'
        indexes = [
            models.Index(fields=['service_type']),
            models.Index(fields=['created_at'])
        ]
        
    def save(self, *args, **kwargs):
        cache.delete(f'api_config_{self.service_type}')
        super().save(*args, **kwargs)
    
    def __str__(self):
        return f"{self.service_type} API Config"

class ChatMessage(models.Model):
    role = models.CharField(max_length=10)  # 'user' 或 'ai'
    content = models.TextField()
    timestamp = models.DateTimeField(auto_now_add=True)
    session_id = models.CharField(max_length=100, default='default')
    status = models.CharField(
        max_length=20,
        choices=[
            ('pending', '处理中'),
            ('success', '成功'),
            ('failed', '失败')
        ],
        default='pending'
    )
    
    class Meta:
        db_table = 'chat_messages'
        ordering = ['timestamp']
        indexes = [
            models.Index(fields=['session_id', 'timestamp']),
            models.Index(fields=['status'])
        ]
        
    def __str__(self):
        return f"{self.role}: {self.content[:50]}..."

class SystemPrompt(models.Model):
    PROMPT_TYPES = [
        ('cleaning', '数据清洗'),
        ('labeling', '数据标注'),
        ('chat', '聊天对话')
    ]
    
    type = models.CharField(
        max_length=20, 
        choices=PROMPT_TYPES,
        verbose_name='提示词类型'
    )
    content = models.TextField(
        verbose_name='提示词内容',
        help_text='系统提示词的具体内容'
    )
    json_schema = models.TextField(
        null=True, 
        blank=True, 
        verbose_name='JSON格式范例',
        help_text='用于规范化输出的JSON格式示例，标注类型必填'
    )
    is_default = models.BooleanField(
        default=False, 
        verbose_name='是否默认',
        help_text='每种类型只能有一个默认提示词'
    )
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='创建时间')
    updated_at = models.DateTimeField(auto_now=True, verbose_name='更新时间')

    class Meta:
        db_table = 'system_prompts'
        indexes = [
            models.Index(fields=['type']),
            models.Index(fields=['is_default'])
        ]
        verbose_name = '系统提示词'
        verbose_name_plural = '系统示词'

    def __str__(self):
        return f"{self.get_type_display()}: {self.content[:50]}..."

    def clean(self):
        if self.type == 'labeling' and not self.json_schema:
            raise ValidationError({
                'json_schema': '标注类型的提示词必须提供JSON格式范例'
            })
        
        if self.json_schema:
            try:
                json.loads(self.json_schema)
            except json.JSONDecodeError:
                raise ValidationError({
                    'json_schema': '请输入有效的JSON格式'
                })

    def save(self, *args, **kwargs):
        if self.is_default:
            SystemPrompt.objects.filter(type=self.type, is_default=True).update(is_default=False)
        super().save(*args, **kwargs)

    def get_formatted_prompt(self, **kwargs) -> str:
        """
        获取格式化后的提示词
        :param kwargs: 格式化参数
        :return: 格式化后的提示词
        """
        try:
            return self.content.format(**kwargs)
        except KeyError as e:
            logger.error(f"提示词格式化失败，缺少参数: {str(e)}")
            return self.content
        except Exception as e:
            logger.error(f"提示词格式化失败: {str(e)}")
            return self.content

class BaseDimension(models.Model):
    name = models.CharField(max_length=100, verbose_name='维度名称')
    description = models.TextField(blank=True, null=True, verbose_name='维度描述')
    is_default = models.BooleanField(default=False, verbose_name='是否默认')
    order = models.IntegerField(default=0, verbose_name='排序')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True
        ordering = ['order', 'name']
        indexes = [
            models.Index(fields=['is_default'])
        ]

    def __str__(self):
        return self.name

class CleaningDimension(BaseDimension):
    class Meta:
        db_table = 'cleaning_dimensions'
        verbose_name = '清洗维度'
        verbose_name_plural = '清洗维度'

    @classmethod
    def get_default_dimensions(cls):
        return [
            "错别字纠正",
            "标点符号规范",
            "格式统一",
            "语法规范",
            "专业术语统一"
        ]

class LabelingDimension(BaseDimension):
    class Meta:
        db_table = 'labeling_dimensions'
        verbose_name = '标注维度'
        verbose_name_plural = '标注维度'

    @classmethod
    def get_default_dimensions(cls):
        return [
            "意图",
            "角色",
            "情感",
            "主题",
            "关键词"
        ]

@receiver(post_migrate)
def create_default_dimensions(sender, **kwargs):
    if sender.name == 'mainapp':
        for i, name in enumerate(CleaningDimension.get_default_dimensions()):
            CleaningDimension.objects.get_or_create(
                name=name,
                defaults={
                    'is_default': True,
                    'order': i,
                    'description': f'默认清洗维度：{name}'
                }
            )
        
        for i, name in enumerate(LabelingDimension.get_default_dimensions()):
            LabelingDimension.objects.get_or_create(
                name=name,
                defaults={
                    'is_default': True,
                    'order': i,
                    'description': f'默认标注维度：{name}'
                }
            )

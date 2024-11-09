from django.contrib import admin
from django import forms
from .models import APIConfig, SystemPrompt, ChatMessage, CleaningDimension, LabelingDimension
import json

# Register your models here.

@admin.register(APIConfig)
class APIConfigAdmin(admin.ModelAdmin):
    list_display = ('service_type', 'base_url', 'created_at', 'updated_at')
    search_fields = ('service_type', 'base_url')
    list_filter = ('service_type', 'created_at')
    readonly_fields = ('created_at', 'updated_at')

    def get_form(self, request, obj=None, **kwargs):
        form = super().get_form(request, obj, **kwargs)
        form.base_fields['api_key'].widget.attrs['style'] = 'width: 400px;'
        return form

@admin.register(SystemPrompt)
class SystemPromptAdmin(admin.ModelAdmin):
    list_display = ('type', 'is_default', 'created_at', 'updated_at')
    list_filter = ('type', 'is_default')
    search_fields = ('content', 'json_schema')
    readonly_fields = ('created_at', 'updated_at')

    fieldsets = (
        (None, {
            'fields': ('type', 'is_default')
        }),
        ('提示词配置', {
            'fields': ('content', 'json_schema'),
            'classes': ('wide',)
        }),
        ('时间信息', {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )

    def get_form(self, request, obj=None, **kwargs):
        form = super().get_form(request, obj, **kwargs)
        form.base_fields['content'].widget.attrs['style'] = 'width: 800px; height: 200px;'
        form.base_fields['json_schema'].widget.attrs['style'] = 'width: 800px; height: 200px;'
        return form

    def has_delete_permission(self, request, obj=None):
        if obj and obj.is_default:  # 不允许删除默认提示词
            return False
        return True

    def save_model(self, request, obj, form, change):
        try:
            # 验证 JSON Schema
            if obj.json_schema:
                json.loads(obj.json_schema)
            
            # 验证提示词格式
            try:
                obj.content.format(dimensions="test", content="test")
            except KeyError as e:
                self.message_user(request, f"提示词格式错误：缺少必要的格式化参数 {str(e)}", level='ERROR')
                return
            
            super().save_model(request, obj, form, change)
        except json.JSONDecodeError:
            self.message_user(request, "JSON Schema 格式无效", level='ERROR')

@admin.register(ChatMessage)
class ChatMessageAdmin(admin.ModelAdmin):
    list_display = ('role', 'content_preview', 'session_id', 'status', 'timestamp')
    list_filter = ('role', 'status', 'timestamp')
    search_fields = ('content', 'session_id')
    readonly_fields = ('timestamp',)
    
    def content_preview(self, obj):
        return obj.content[:100] + '...' if len(obj.content) > 100 else obj.content
    content_preview.short_description = '消息内容'

@admin.register(CleaningDimension)
class CleaningDimensionAdmin(admin.ModelAdmin):
    list_display = ('name', 'description', 'is_default', 'order', 'created_at', 'updated_at')
    list_filter = ('is_default',)
    search_fields = ('name', 'description')
    list_editable = ('order', 'is_default')
    ordering = ('order',)
    readonly_fields = ('created_at', 'updated_at')
    
    def get_readonly_fields(self, request, obj=None):
        return self.readonly_fields

    def has_delete_permission(self, request, obj=None):
        return True

@admin.register(LabelingDimension)
class LabelingDimensionAdmin(admin.ModelAdmin):
    list_display = ('name', 'description', 'is_default', 'order', 'created_at', 'updated_at')
    list_filter = ('is_default',)
    search_fields = ('name', 'description')
    list_editable = ('order', 'is_default')
    ordering = ('order',)
    readonly_fields = ('created_at', 'updated_at')
    
    def get_readonly_fields(self, request, obj=None):
        return self.readonly_fields

    def has_delete_permission(self, request, obj=None):
        return True

# 自定义 Admin 站点标题
admin.site.site_header = 'AI数据处理系统管理后台'
admin.site.site_title = 'AI数据处理系统'
admin.site.index_title = '管理面板'

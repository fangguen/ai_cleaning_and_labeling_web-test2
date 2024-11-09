from django.urls import path

from . import views

urlpatterns = [
    path('', views.index, name='index'),
    # 文件处理
    path('check-processing-status/<str:processing_key>/', 
         views.check_processing_status, 
         name='check_processing_status'),
    path('upload-file/', views.upload_file, name='upload_file'),
    path('process-file/', views.process_file, name='process_file'),
    path('export-processed-data/', views.export_processed_data, name='export_processed_data'),
    # 保存API配置
    path('set-api-config/', views.save_api_config, name='save_api_config'),
    path('get-api-config/', views.get_api_config, name='get_api_config'),
    # 聊天
    path('chat/', views.chat, name='chat'),
    path('clear-chat-history/', views.clear_chat_history, name='clear_chat_history'),
    path('export-chat-history/', views.export_chat_history, name='export_chat_history'),
    # API endpoints for dimensions
    path('api/dimensions/', views.get_dimensions, name='get_dimensions'),
    path('api/dimensions/add/', views.add_dimension, name='add_dimension'),
    path('api/dimensions/<str:dimension_type>/<int:dimension_id>/delete/', 
         views.delete_dimension, 
         name='delete_dimension'),
]

import json
import logging
import os
import tiktoken
import traceback
from django.conf import settings
from django.http import JsonResponse, HttpResponse
from django.shortcuts import render
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST,require_GET,require_http_methods
from .ai_services import AIServiceFactory, AIServiceBase, create_ai_service
from .utils import count_tokens, truncate_messages
import time
from datetime import datetime
from .models import APIConfig, ChatMessage, SystemPrompt, CleaningDimension, LabelingDimension
from .services import ChatService
from .exceptions import AIWebException
from django.views.decorators.http import require_http_methods
from cryptography.fernet import Fernet
from django.views.decorators.csrf import ensure_csrf_cookie
from django.core.cache import cache  # 添加这个导入
import uuid
from .data_services import TextProcessor


logger = logging.getLogger(__name__)


# 使用tiktoken计算token数量
def num_tokens_from_string(string: str, encoding_name: str = "cl100k_base") -> int:
    encoding = tiktoken.get_encoding(encoding_name)
    num_tokens = len(encoding.encode(string))
    return num_tokens


@ensure_csrf_cookie
def index(request):
    """主页视图"""
    try:
        # 分别获取清洗和标注维度
        cleaning_dimensions = list(CleaningDimension.objects.all().order_by('order').values(
            'id', 
            'name', 
            'description', 
            'is_default', 
            'order'
        ))
        
        labeling_dimensions = list(LabelingDimension.objects.all().order_by('order').values(
            'id', 
            'name', 
            'description', 
            'is_default', 
            'order'
        ))
        
        context = {
            'cleaning_dimensions': json.dumps(cleaning_dimensions),
            'labeling_dimensions': json.dumps(labeling_dimensions)
        }
        
        return render(request, 'index.html', context)
    except Exception as e:
        logger.error(f"获取维度数据失败: {str(e)}")
        return render(request, 'index.html', {
            'cleaning_dimensions': '[]',
            'labeling_dimensions': '[]',
            'error': str(e)
        })


def handle_uploaded_file(f):
    upload_dir = os.path.join(settings.MEDIA_ROOT, 'uploads')
    os.makedirs(upload_dir, exist_ok=True)
    file_path = os.path.join(upload_dir, f.name)

    with open(file_path, 'wb+') as destination:
        for chunk in f.chunks():
            destination.write(chunk)

    return file_path


@csrf_exempt
@require_POST
def process_file(request):
    """处理文件内容"""
    try:
        logger.info("收到文件处理请求")
        data = json.loads(request.body)
        content = data.get('content', '')
        process_type = data.get('process_type', '')
        dimension_ids = data.get('dimensions', [])
        
        if not content or not process_type or not dimension_ids:
            raise ValueError("缺少必要参数")
            
        logger.info(f"处理类型: {process_type}")
        logger.info(f"选择的维度IDs: {dimension_ids}")
        
        # 生成处理标识
        processing_key = f"process_{int(time.time())}_{uuid.uuid4().hex[:8]}"
        logger.info(f"开始异步处理: {processing_key}")
        
        # 获取最新的API配置
        api_config = APIConfig.objects.latest('updated_at')
        if not api_config:
            raise ValueError("未找到API配置")
            
        # 创建AI服务实例
        service = create_ai_service(
            api_config.service_type,
            api_config.api_key,
            api_config.base_url
        )
        
        # 创建文本处理器并处理
        processor = TextProcessor(service)
        result = processor.process_content(
            content=content,
            process_type=process_type,
            dimensions=dimension_ids,
            processing_key=processing_key
        )
        
        if result:
            cache.set(processing_key, {
                'status': 'completed',
                'result': result,
                'process_type': process_type,
                'timestamp': datetime.now().isoformat()
            }, timeout=3600)
            return JsonResponse({'processing_key': processing_key})
        else:
            raise Exception("处理失败")
            
    except Exception as e:
        logger.error(f"处理文件失败: {str(e)}")
        return JsonResponse({'error': str(e)}, status=500)


@require_GET
def check_processing_status(request, processing_key):
    """检查处理状态"""
    try:
        # 从缓存获取结果
        result = cache.get(processing_key)
        if result:
            return JsonResponse(result)
        return JsonResponse({'status': 'processing'})
    except Exception as e:
        logger.error(f"检查处理状态失败: {str(e)}")
        return JsonResponse({
            'status': 'failed',
            'error': str(e)
        }, status=500)


@csrf_exempt
@require_POST
def set_api_config(request):
    try:
        data = json.loads(request.body)
        service_type = data.get('service_type')
        api_key = data.get('api_key')
        
        if not service_type or not api_key:
            return JsonResponse({'error': '缺少必要参数'}, status=400)
        
        # 更新或创建配置
        config, created = APIConfig.objects.update_or_create(
            service_type=service_type,
            defaults={
                'api_key': api_key,
                'system_prompt': data.get('system_prompt', '')
            }
        )
        
        return JsonResponse({'message': '配置已保存'})
    except Exception as e:
        logger.error(f"保存API配置失败: {str(e)}")
        return JsonResponse({'error': str(e)}, status=500)


def handle_api_errors(view_func):
    """一的误处理装饰器"""
    def wrapper(request, *args, **kwargs):
        try:
            return view_func(request, *args, **kwargs)
        except AIWebException as e:
            logger.error(f"业务错误: {str(e)}")
            return JsonResponse({'error': str(e)}, status=400)
        except Exception as e:
            logger.error(f"系统误: {str(e)}")
            return JsonResponse({'error': '服务器内部错误'}, status=500)
    return wrapper


@csrf_exempt
@require_POST
@handle_api_errors
def chat(request):
    """处理聊天请求"""
    try:
        data = json.loads(request.body)
        message = data.get('message')
        session_id = data.get('session_id', 'default')
        
        if not message:
            return JsonResponse({'error': '消息不能为空'}, status=400)
            
        # 获取最新的API配置
        api_config = APIConfig.objects.order_by('-updated_at').first()
        if not api_config:
            return JsonResponse({'error': '请先配置API'}, status=400)
            
        chat_service = ChatService(api_config)
        
        # 保存用户消息
        ChatMessage.objects.create(
            role='user',
            content=message,
            session_id=session_id,
            status='success'
        )
        
        # 处理消息
        result = chat_service.process_message(
            message=message,
            session_id=session_id
        )
        
        # 保存并处理 AI 回复
        if result.get('reply'):
            processed_reply = result['reply']
            # 保存原始回复
            ChatMessage.objects.create(
                role='assistant',
                content=processed_reply,
                session_id=session_id,
                status='success'
            )
            
            result['reply'] = processed_reply

        return JsonResponse(result)
        
    except Exception as e:
        logger.error(f"处理聊天消息失败: {str(e)}", exc_info=True)
        return JsonResponse({'error': f'处理失败: {str(e)}'}, status=500)


@csrf_exempt
def clear_chat_history(request):
    """清除聊天历史"""
    if request.method == 'POST':
        request.session['chat_history'] = []
        return JsonResponse({'message': '聊天历史已清除'})
    return JsonResponse({'error': '无效的请求方'}, status=405)


@csrf_exempt
@require_POST
def export_chat_history(request):
    """导出聊天历史"""
    try:
        session_id = request.session.session_key
        messages = ChatMessage.objects.filter(session_id=session_id).order_by('created_at')
        
        # 构建导数据
        export_data = []
        for msg in messages:
            export_data.append({
                'role': msg.role,
                'content': msg.content,
                'timestamp': msg.created_at.strftime('%Y-%m-%d %H:%M:%S')
            })
        
        response = HttpResponse(
            json.dumps(export_data, ensure_ascii=False, indent=2),
            content_type='application/json'
        )
        response['Content-Disposition'] = 'attachment; filename="chat_history.json"'
        return response
    except Exception as e:
        logger.error(f"导出聊天历史错误: {str(e)}")
        return JsonResponse({'error': str(e)}, status=500)


@require_POST
def save_api_config(request):
    try:
        data = json.loads(request.body)
        service_type = data.get('service_type')
        api_key = data.get('api_key')
        base_url = data.get('base_url')
        
        if not service_type or not api_key:
            return JsonResponse({'error': '缺少必要参数'}, status=400)
        
        # 更新或创建 API 配置
        config, created = APIConfig.objects.update_or_create(
            defaults={
                'service_type': service_type,
                'api_key': api_key,
                'base_url': base_url if service_type == 'openai' else None
            }
        )
        
        # 验证 API key
        try:
            service = AIServiceFactory.create_service(
                service_type, 
                api_key,
                base_url if service_type == 'openai' else None
            )
            
            if not service or not service.validate_api_key():
                return JsonResponse({'error': 'API密钥验证失败'}, status=400)
        except Exception as e:
            return JsonResponse({'error': f'API验证失败: {str(e)}'}, status=400)
        
        return JsonResponse({'message': '配置已保存', 'success': True})
    except Exception as e:
        logger.error(f"保存API配置失败: {str(e)}")
        return JsonResponse({'error': str(e)}, status=400)


@require_POST
def upload_file(request):
    """处理文件上传"""
    try:
        if 'file' not in request.FILES:
            return JsonResponse({'error': '没有上传文件'}, status=400)
        
        file = request.FILES['file']
        
        # 支持更多文本文件格式
        allowed_extensions = ('.txt', '.json', '.md', '.csv', '.log')
        if not file.name.lower().endswith(allowed_extensions):
            return JsonResponse({
                'error': f'不支持的文件类型，支持的格式：{", ".join(allowed_extensions)}'
            }, status=400)
        
        try:
            content = file.read().decode('utf-8')
            
            # 如果是JSON文件，验证JSON格式
            if file.name.lower().endswith('.json'):
                try:
                    json.loads(content)
                except json.JSONDecodeError:
                    # JSON格式无效时，仍然返回内容，只是给出警告
                    return JsonResponse({
                        'message': '文件上传成功（JSON格式无效，将作为普通文本处理）',
                        'content': content,
                        'filename': file.name
                    })
            
            return JsonResponse({
                'message': '文件上传成功',
                'content': content,
                'filename': file.name
            })
            
        except UnicodeDecodeError:
            # 尝试其他编码
            try:
                content = file.read().decode('gbk')
                return JsonResponse({
                    'message': '文件上传成功使用GBK编码）',
                    'content': content,
                    'filename': file.name
                })
            except:
                return JsonResponse({'error': '不支持的文件编码，请使用UTF-8或GBK编码'}, status=400)
            
    except Exception as e:
        logger.error(f"文件上传错误: {str(e)}")
        return JsonResponse({'error': str(e)}, status=500)

@require_POST
def clear_chat_history(request):
    """清除聊天历史"""
    try:
        session_id = request.POST.get('session_id')
        if session_id:
            ChatMessage.objects.filter(session_id=session_id).delete()
        return JsonResponse({'message': '聊天历史已清除'})
    except Exception as e:
        logger.error(f"清除聊天历史错误: {str(e)}")
        return JsonResponse({'error': str(e)}, status=500)

@require_http_methods(["GET"])
def get_api_config(request):
    """获取API配置"""
    try:
        config = APIConfig.objects.order_by('-updated_at').first()
        if not config:
            return JsonResponse({
                'service_type': '',
                'api_key': '',
                'base_url': ''
            })
            
        return JsonResponse({
            'service_type': config.service_type,
            'api_key': config.api_key,
            'base_url': config.base_url
        })
    except Exception as e:
        logger.error(f"获取API配置错误: {str(e)}")
        return JsonResponse({'error': str(e)}, status=500)

@require_http_methods(["GET"])
def get_dimensions(request):
    """获取所有维度"""
    try:
        cleaning_dimensions = list(CleaningDimension.objects.all().order_by('order').values(
            'id', 
            'name', 
            'description', 
            'is_default', 
            'order'
        ))
        
        labeling_dimensions = list(LabelingDimension.objects.all().order_by('order').values(
            'id', 
            'name', 
            'description', 
            'is_default', 
            'order'
        ))
        
        return JsonResponse({
            'cleaning_dimensions': cleaning_dimensions,
            'labeling_dimensions': labeling_dimensions
        })
    except Exception as e:
        logger.error(f"获取维度失败: {str(e)}")
        return JsonResponse({'error': str(e)}, status=500)

@require_http_methods(["POST"])
def add_dimension(request):
    """添加新维度"""
    try:
        data = json.loads(request.body)
        
        if not data.get('type') or not data.get('name'):
            return JsonResponse({'error': '维度类型和名称不能为空'}, status=400)
            
        # 选择正确的维度模型
        DimensionModel = CleaningDimension if data['type'] == 'cleaning' else LabelingDimension
        
        # 创建新维度
        dimension = DimensionModel.objects.create(
            name=data['name'],
            description=data.get('description', ''),
            is_default=False,
            order=DimensionModel.objects.count()
        )
        
        return JsonResponse({
            'id': dimension.id,
            'name': dimension.name,
            'description': dimension.description,
            'is_default': dimension.is_default,
            'order': dimension.order
        })
    except Exception as e:
        logger.error(f"添加维度失败: {str(e)}")
        return JsonResponse({'error': f'添加维度失败: {str(e)}'}, status=400)

@require_POST  # 改为 POST 方法
def delete_dimension(request, dimension_type, dimension_id):  # 注意参数顺序要和 URL 一致
    """删除维度"""
    try:
        # 选择正确的维度模型
        DimensionModel = CleaningDimension if dimension_type == 'cleaning' else LabelingDimension
        
        dimension = DimensionModel.objects.get(id=dimension_id)
        
        if dimension.is_default:
            return JsonResponse({'error': '不能删除默认维度'}, status=400)
            
        dimension.delete()
        
        # 重新排序
        remaining_dimensions = DimensionModel.objects.all().order_by('order')
        for i, dim in enumerate(remaining_dimensions):
            dim.order = i
            dim.save()
            
        return JsonResponse({'message': '删除成功'})
    except DimensionModel.DoesNotExist:
        return JsonResponse({'error': '维度不存在'}, status=404)
    except Exception as e:
        logger.error(f"删除维度失败: {str(e)}")
        return JsonResponse({'error': f'删除维度失败: {str(e)}'}, status=500)


@require_POST
def export_processed_data(request):
    """导出处理后的数据"""
    try:
        data = json.loads(request.body)
        
        # 构建导出数据
        export_data = {
            'timestamp': datetime.now().isoformat(),
            'process_type': data.get('process_type'),
            'dimensions': data.get('dimensions', []),
            'original_data': data.get('original_data', ''),
            'processed_result': data.get('processed_result', '')
        }

        # 创建临时文件
        temp_dir = os.path.join(settings.BASE_DIR, 'temp')
        os.makedirs(temp_dir, exist_ok=True)
        
        temp_file = os.path.join(
            temp_dir, 
            f"export_{datetime.now().strftime('%Y%m%d_%H%M%S')}_{uuid.uuid4().hex[:8]}.json"
        )

        # 写入数据
        with open(temp_file, 'w', encoding='utf-8') as f:
            json.dump(export_data, f, ensure_ascii=False, indent=2)

        # 读取文件并返回
        with open(temp_file, 'rb') as f:
            response = HttpResponse(f.read(), content_type='application/json')
            response['Content-Disposition'] = f'attachment; filename="{os.path.basename(temp_file)}"'

        # 清理临时文件
        os.remove(temp_file)

        return response

    except Exception as e:
        logger.error(f"导出数据失败: {str(e)}")
        return JsonResponse({'error': str(e)}, status=500)





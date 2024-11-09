import logging
from django.http import JsonResponse
from .exceptions import AIWebException

logger = logging.getLogger(__name__)

class ErrorHandlingMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        try:
            response = self.get_response(request)
            return response
        except AIWebException as e:
            logger.warning(f"已处理的异常: {str(e)}")
            return JsonResponse({
                'error': str(e)
            }, status=400)
        except Exception as e:
            logger.error(f"未处理的异常: {str(e)}", exc_info=True)
            return JsonResponse({
                'error': '服务器内部错误',
                'detail': str(e)
            }, status=500) 
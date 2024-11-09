class AIWebException(Exception):
    """基础异常类"""
    pass

class APIConfigError(AIWebException):
    """API配置相关错误"""
    pass

class AIServiceError(AIWebException):
    """AI服务相关错误"""
    pass

class SecurityError(AIWebException):
    """安全相关错误"""
    pass

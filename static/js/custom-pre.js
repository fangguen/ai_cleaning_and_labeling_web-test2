// 全局变量
let processedData, resultTable;

// API 配置管理器
class APIConfigManager {
    constructor() {
        this.modal = new bootstrap.Modal(document.getElementById('apiConfigModal'));
        this.form = document.getElementById('apiConfigForm');
        this.serviceType = document.getElementById('serviceType');
        this.baseUrlGroup = document.getElementById('baseUrlGroup');
        this.baseUrl = document.getElementById('baseUrl');
        this.apiKey = document.getElementById('apiKey');
        this.systemPrompt = document.getElementById('systemPrompt');
        this.saveButton = document.getElementById('saveApiConfig');
        this.chatMessages = document.querySelector('.chat-messages');
        
        this.apiConfigBtn = document.getElementById('apiConfigBtn');
        this.instructionsBtn = document.getElementById('instructionsBtn');
        this.instructionsModal = new bootstrap.Modal(document.getElementById('instructionsModal'));
        
        this.setupEventListeners();
        this.loadCurrentConfig();
    }

    setupEventListeners() {
        this.apiConfigBtn?.addEventListener('click', () => {
            this.modal.show();
        });

        this.instructionsBtn?.addEventListener('click', () => {
            this.instructionsModal.show();
        });

        if (this.serviceType) {
            this.serviceType.addEventListener('change', () => {
                if (this.baseUrlGroup) {
                    this.baseUrlGroup.style.display = 
                        this.serviceType.value === 'openai' ? 'block' : 'none';
                }
            });
        }

        if (this.saveButton) {
            this.saveButton.addEventListener('click', async () => {
                await this.saveConfig();
            });
        }
    }

    async saveConfig() {
        try {
            const config = {
                service_type: this.serviceType.value,
                api_key: this.apiKey.value,
                system_prompt: this.systemPrompt.value
            };

            if (this.serviceType.value === 'openai' && this.baseUrl.value.trim()) {
                config.base_url = this.baseUrl.value.trim();
            }

            if (!config.service_type || !config.api_key) {
                alert('请选择AI服务并输入API Key');
                return;
            }

            showLoading();
            const response = await fetch('/set-api-config/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': getCookie('csrftoken')
                },
                body: JSON.stringify(config)
            });

            const data = await response.json();
            hideLoading();

            if (response.ok) {
                if (this.chatMessages && window.chatManager) {
                    this.chatMessages.innerHTML = '';
                    window.chatManager.appendMessage('ai', `已切换至 ${config.service_type} 服务，有什么可以帮你的吗？`);
                    updateTokenCount(0, 3072);
                }
                this.modal.hide();
                alert('配置保存成功！');
            } else {
                throw new Error(data.error || '保存失败');
            }
        } catch (error) {
            hideLoading();
            console.error('Error:', error);
            alert(error.message || '保存配置时出错');
        }
    }

    async loadCurrentConfig() {
        try {
            const response = await fetch('/get-api-config/');
            if (!response.ok) {
                if (response.status === 404) {
                    // 如果没有配置，使用默认值
                    this.setDefaultConfig();
                    return;
                }
                throw new Error('加载配置失败');
            }
            const config = await response.json();
            this.updateConfigForm(config);
        } catch (error) {
            console.error('加载配置失败:', error);
            this.setDefaultConfig();
        }
    }

    setDefaultConfig() {
        this.updateConfigForm({
            service_type: 'openai',
            api_key: '',
            base_url: '',
            system_prompt: ''
        });
    }

    updateConfigForm(config) {
        if (this.serviceType) this.serviceType.value = config.service_type || 'openai';
        if (this.apiKey) this.apiKey.value = config.api_key || '';
        if (this.baseUrl) this.baseUrl.value = config.base_url || '';
        if (this.systemPrompt) this.systemPrompt.value = config.system_prompt || '';
        
        if (this.baseUrlGroup) {
            this.baseUrlGroup.style.display = 
                config.service_type === 'openai' ? 'block' : 'none';
        }
    }
}

// 维度管理器
// 维度管理器类
class DimensionManager {
    constructor() {
        this.dimensions = {
            cleaning: [],
            labeling: []
        };
        this.modal = new bootstrap.Modal(document.getElementById('addDimensionModal'));
        this.cleaningContainer = document.getElementById('cleaningDimensions');
        this.labelingContainer = document.getElementById('labelingDimensions');
        
        this.setupEventListeners();
        this.loadDimensions();
    }

    async loadDimensions() {
        try {
            showLoading();
            const response = await fetch('/api/dimensions/');
            if (!response.ok) {
                throw new Error('加载维度失败');
            }
            const data = await response.json();
            
            // 直接使用后端返回的分类数据
            this.dimensions = {
                cleaning: data.cleaning_dimensions || [],
                labeling: data.labeling_dimensions || []
            };
            
            this.updateDimensionsDisplay();
        } catch (error) {
            console.error('加载维度失败:', error);
            showError('加载维度失败，请刷新页面重试');
        } finally {
            hideLoading();
        }
    }

    setupEventListeners() {
        // 添加维度按钮事件
        const addDimensionBtn = document.getElementById('addDimensionBtn');
        const addDimensionSubmitBtn = document.getElementById('addDimensionSubmitBtn');
        const dimensionTypeSelect = document.getElementById('dimensionType');

        if (addDimensionBtn) {
            addDimensionBtn.addEventListener('click', () => {
                document.getElementById('addDimensionForm').reset();
                this.modal.show();
            });
        }

        if (addDimensionSubmitBtn) {
            addDimensionSubmitBtn.addEventListener('click', async () => {
                await this.addDimension();
            });
        }

        // 处理类型切换时更新维度显示
        document.querySelectorAll('input[name="processType"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                const type = e.target.value;
                this.toggleDimensionsVisibility(type);
            });
        });
    }

    toggleDimensionsVisibility(type) {
        if (this.cleaningContainer) {
            this.cleaningContainer.style.display = type === 'cleaning' ? 'block' : 'none';
        }
        if (this.labelingContainer) {
            this.labelingContainer.style.display = type === 'labeling' ? 'block' : 'none';
        }
    }

    async addDimension() {
        const type = document.getElementById('dimensionType').value;
        const name = document.getElementById('dimensionName').value.trim();
        const description = document.getElementById('dimensionDescription').value.trim();

        if (!name) {
            alert('请输入维度');
            return;
        }

        try {
            showLoading();
            const response = await fetch('/api/dimensions/add/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': getCookie('csrftoken')
                },
                body: JSON.stringify({ type, name, description })
            });

            const data = await response.json();
            if (response.ok) {
                await this.loadDimensions();
                this.modal.hide();
                document.getElementById('addDimensionForm').reset();
            } else {
                throw new Error(data.error || '添加失败');
            }
        } catch (error) {
            console.error('添加维度失败:', error);
            alert(error.message || '添加维度失败');
        } finally {
            hideLoading();
        }
    }

    async deleteDimension(dimensionId) {
        if (!confirm('确定要删除这个维度吗？此操作不可恢复。')) {
            return;
        }

        try {
            showLoading();
            const response = await fetch(`/api/dimensions/${dimensionId}/delete/`, {
                method: 'DELETE',
                headers: {
                    'X-CSRFToken': getCookie('csrftoken')
                }
            });

            if (response.ok) {
                await this.loadDimensions();
            } else {
                const data = await response.json();
                throw new Error(data.error || '删除维度失败');
            }
        } catch (error) {
            console.error('删除维度失败:', error);
            alert(error.message || '删除维度失败');
        } finally {
            hideLoading();
        }
    }

    updateDimensionsDisplay() {
        if (this.cleaningContainer) {
            this.updateDimensionsList(
                this.cleaningContainer, 
                this.dimensions.cleaning,
                'cleaning'
            );
        }
        if (this.labelingContainer) {
            this.updateDimensionsList(
                this.labelingContainer, 
                this.dimensions.labeling,
                'labeling'
            );
        }
    }

    updateDimensionsList(container, dimensions, type) {
        const dimensionsList = container.querySelector('.dimensions-list');
        if (!dimensionsList) return;

        dimensionsList.innerHTML = (dimensions || []).map(dimension => `
            <div class="dimension-item">
                <div class="form-check">
                    <input type="checkbox" 
                           class="form-check-input dimension-checkbox" 
                           id="dimension_${dimension.id}"
                           value="${dimension.id}"
                           data-type="${type}"
                           ${dimension.is_default ? 'checked' : ''}>
                    <label class="form-check-label" for="dimension_${dimension.id}">
                        ${dimension.name}
                        ${dimension.description ? 
                            `<small class="text-muted d-block">${dimension.description}</small>` : 
                            ''}
                    </label>
                    ${!dimension.is_default ? `
                        <button class="btn btn-sm btn-outline-danger delete-dimension" 
                                data-dimension-id="${dimension.id}"
                                data-dimension-type="${type}">
                            <i class="fas fa-trash"></i>
                        </button>
                    ` : ''}
                </div>
            </div>
        `).join('');

        // 绑定删除按钮事件
        dimensionsList.querySelectorAll('.delete-dimension').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.preventDefault();
                e.stopPropagation();
                const dimensionId = e.currentTarget.dataset.dimensionId;
                const dimensionType = e.currentTarget.dataset.dimensionType;
                await this.deleteDimension(dimensionType, dimensionId);
            });
        });
    }
}

// 文件处理器类
class FileProcessor {
    constructor() {
        this.processType = 'cleaning';
        this.isProcessing = false;
        this.setupEventListeners();
    }

    setupEventListeners() {
        // 处理类型切换事件
        document.querySelectorAll('input[name="processType"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                this.processType = e.target.value;
                this.updateDimensionsVisibility();
            });
        });

        // 文件上���事件
        const fileInput = document.getElementById('fileInput');
        if (fileInput) {
            fileInput.addEventListener('change', (e) => this.handleFileInput(e));
        }

        // 开始处理按钮事件
        const startButton = document.getElementById('startProcessing');
        if (startButton) {
            startButton.addEventListener('click', async (e) => {
                e.preventDefault();
                await this.processFile();
            });
        }
    }

    updateDimensionsVisibility() {
        // 更新维度显示
        document.getElementById('cleaningDimensions').style.display = 
            this.processType === 'cleaning' ? 'block' : 'none';
        document.getElementById('labelingDimensions').style.display = 
            this.processType === 'labeling' ? 'block' : 'none';
    }

    async handleFileInput(event) {
        const file = event.target.files[0];
        if (!file) return;

        try {
            const text = await file.text();
            document.getElementById('originalData').value = text;
        } catch (error) {
            console.error('读取文件失败:', error);
            showError('读取文件失败');
        }
    }

    async processFile() {
        if (this.isProcessing) {
            showError('已有处理任务在进行中');
            return;
        }

        try {
            this.isProcessing = true;
            showLoading('正在处理中...');
            
            const content = document.getElementById('originalData').value;
            if (!content) {
                showError('请输入要处理的内容');
                return;
            }

            const selectedDimensions = Array.from(
                document.querySelectorAll(`.dimension-checkbox[data-type="${this.processType}"]:checked`)
            ).map(cb => parseInt(cb.value));

            if (selectedDimensions.length === 0) {
                showError('请至少选择一个处理维度');
                return;
            }

            // 发送处理请求
            const response = await fetch('/process-file/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': getCookie('csrftoken')
                },
                body: JSON.stringify({
                    content,
                    process_type: this.processType,
                    dimensions: selectedDimensions
                })
            });

            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.error || '处理失败');
            }

            // 开始轮询处理状态
            if (data.processing_key) {
                this.pollProcessingStatus(data.processing_key);
            }

        } catch (error) {
            console.error('处理文件失败:', error);
            showError(error.message || '处理失败');
        } finally {
            this.isProcessing = false;
            hideLoading();
        }
    }

    async pollProcessingStatus(processingKey) {
        const maxAttempts = 180;  // 最多轮询3分钟
        let attempts = 0;

        const poll = async () => {
            try {
                if (attempts >= maxAttempts) {
                    throw new Error('处理超时，请重试');
                }

                const response = await fetch(`/check-processing-status/${processingKey}/`);
                const data = await response.json();

                if (data.status === 'error') {
                    throw new Error(data.error || '处理失败');
                }

                if (data.status === 'completed') {
                    document.getElementById('processedData').value = data.processed_text || data.result;
                    showSuccess('处理完成');
                    this.isProcessing = false;
                    hideLoading();
                    return;
                }

                // 继续轮询
                attempts++;
                setTimeout(poll, 1000);

            } catch (error) {
                console.error('检查处理状态失败:', error);
                showError(error.message || '处理失败');
                this.isProcessing = false;
                hideLoading();
            }
        };

        await poll();
    }
}

// 添加进度显示函数
function updateProgress(current, total) {
    const loadingEl = document.querySelector('.loading-overlay');
    if (loadingEl) {
        const progressEl = loadingEl.querySelector('.progress-text') || 
            loadingEl.appendChild(document.createElement('div'));
        progressEl.className = 'progress-text';
        progressEl.textContent = `处理进度: ${Math.round(current/total*100)}%`;
    }
}

// 添加成功提示函数
function showSuccess(message) {
    const successToast = document.getElementById('successToast');
    if (successToast) {
        const toastBody = successToast.querySelector('.toast-body');
        if (toastBody) {
            toastBody.textContent = message;
            const toast = new bootstrap.Toast(successToast);
            toast.show();
        }
    }
}

function showError(message) {
    const errorToast = document.getElementById('errorToast');
    if (errorToast) {
        const toastBody = errorToast.querySelector('.toast-body');
        if (toastBody) {
            toastBody.textContent = message;
            const toast = new bootstrap.Toast(errorToast);
            toast.show();
        }
    }
}

// 聊天管理器类
class ChatManager {
    constructor() {
        this.chatContainer = document.getElementById('chatContainer');
        this.chatMessages = this.chatContainer?.querySelector('.chat-messages');
        this.messageInput = this.chatContainer?.querySelector('.message-input');
        this.sendButton = this.chatContainer?.querySelector('.send-button');
        this.toggleButton = document.getElementById('toggleChatBtn');
        this.clearButton = document.getElementById('clearChatBtn');
        this.exportButton = document.getElementById('exportChatBtn');
        
        this.setupEventListeners();
        
        // 生成新的会话ID
        this.sessionId = 'chat_' + new Date().getTime() + '_' + Math.random().toString(36).substr(2, 9);
        
        // 初始消息也需要使用session_id
        this.appendMessage('ai', '你好！我是AI助手，有什么可以帮你的吗？', this.sessionId);
        
        // 配置 marked
        marked.setOptions({
            breaks: true,  // 支持 GitHub 风格的换行
            gfm: true,     // 启用 GitHub 风格的 Markdown
            headerIds: false,
            mangle: false
        });

        this.typingSpeed = 30; // 打字速度（毫秒/字符）
        this.isTyping = false; // 是否正在打字
    }

    setupEventListeners() {
        // 发送消息事件
        this.sendButton?.addEventListener('click', () => this.sendMessage());
        
        // 输入框回车发送
        this.messageInput?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });

        // 切换聊天窗口
        this.toggleButton?.addEventListener('click', () => {
            this.chatContainer?.classList.toggle('minimized');
            const icon = this.toggleButton.querySelector('i');
            icon.className = this.chatContainer?.classList.contains('minimized') ? 
                'fas fa-expand' : 'fas fa-minus';
        });

        // 清除聊天记录
        this.clearButton?.addEventListener('click', () => {
            if (confirm('确定要清除所有聊天记录吗？')) {
                this.chatMessages.innerHTML = '';
                this.appendMessage('ai', '聊天记录已清除，有什么可以帮你的吗？');
            }
        });

        // 导出聊天记录
        this.exportButton?.addEventListener('click', () => this.exportChat());
    }

    async sendMessage() {
        const message = this.messageInput?.value.trim();
        if (!message) return;
    
        try {
            // 清空输入框
            this.messageInput.value = '';
            
            // 显示用户消息
            this.appendMessage('user', message);
    
            // 发送到服务器
            const response = await fetch('/chat/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': getCookie('csrftoken')
                },
                body: JSON.stringify({
                    message: message,
                    session_id: this.sessionId
                })
            });
    
            const data = await response.json();
    
            if (!response.ok) {
                throw new Error(data.error || '发送失败');
            }
    
            if (data.reply) {
                this.appendMessage('ai', data.reply);
                if (data.tokens_used && data.max_tokens) {
                    updateTokenCount(data.tokens_used, data.max_tokens);
                }
            }
        } catch (error) {
            console.error('发送消息失败:', error);
            showError(error.message || '发送消息失败，请重试');
        }
    }

    async appendMessage(role, content, sessionId) {
        if (!content || !this.chatMessages) return;

        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${role}-message`;
        
        const iconDiv = document.createElement('div');
        iconDiv.className = 'message-icon';
        iconDiv.innerHTML = role === 'user' ? '<i class="fas fa-user"></i>' : 
                           role === 'ai' ? '<i class="fas fa-robot"></i>' : 
                           '<i class="fas fa-info-circle"></i>';
        
        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content markdown-body';
        
        messageDiv.appendChild(iconDiv);
        messageDiv.appendChild(contentDiv);
        this.chatMessages.appendChild(messageDiv);

        // 如果是用户消息，直接显示
        if (role === 'user') {
            contentDiv.innerHTML = this.formatMessage(content);
        } else {
            // AI消息使用打字机效果
            await this.typeMessage(content, contentDiv);
        }

        this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
    }

    async typeMessage(content, element) {
        // 如果已经在打字，等待完成
        if (this.isTyping) {
            await new Promise(resolve => {
                const checkTyping = setInterval(() => {
                    if (!this.isTyping) {
                        clearInterval(checkTyping);
                        resolve();
                    }
                }, 100);
            });
        }

        this.isTyping = true;
        
        // 先渲染Markdown
        const formattedHtml = this.formatMessage(content);
        
        // 创建临时div来解析HTML
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = formattedHtml;
        
        // 清空显示区域
        element.innerHTML = '';
        
        // 递归处理所有节点
        await this.typeNode(tempDiv, element);
        
        // 添加代码复制按钮
        const codeBlocks = element.querySelectorAll('pre code');
        codeBlocks.forEach(block => {
            const copyButton = document.createElement('button');
            copyButton.className = 'copy-button';
            copyButton.innerHTML = '<i class="fas fa-copy"></i>';
            copyButton.onclick = () => {
                navigator.clipboard.writeText(block.textContent)
                    .then(() => {
                        copyButton.innerHTML = '<i class="fas fa-check"></i>';
                        setTimeout(() => {
                            copyButton.innerHTML = '<i class="fas fa-copy"></i>';
                        }, 2000);
                    });
            };
            block.parentElement.appendChild(copyButton);
        });

        this.isTyping = false;
    }

    async typeNode(sourceNode, targetParent) {
        for (const node of sourceNode.childNodes) {
            if (node.nodeType === Node.TEXT_NODE) {
                // 文本节点逐字显示
                const text = node.textContent;
                const textNode = document.createTextNode('');
                targetParent.appendChild(textNode);
                
                for (let i = 0; i < text.length; i++) {
                    textNode.textContent += text[i];
                    await new Promise(resolve => setTimeout(resolve, this.typingSpeed));
                    // 保持滚动到底部
                    this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
                }
            } else {
                // 非文本节点（HTML元素）
                const newElement = document.createElement(node.tagName);
                // 复制属性
                for (const attr of node.attributes || []) {
                    newElement.setAttribute(attr.name, attr.value);
                }
                targetParent.appendChild(newElement);
                
                // 递归处理子节点
                await this.typeNode(node, newElement);
            }
        }
    }

    formatMessage(content) {
        try {
            // 使用 DOMPurify 清理 HTML，然后用 marked 渲染 Markdown
            const htmlContent = DOMPurify.sanitize(marked.parse(content));
            
            // 添加代码高亮样式
            const formattedHtml = htmlContent.replace(
                /<pre><code class="language-(\w+)">([\s\S]+?)<\/code><\/pre>/g,
                '<pre class="code-block language-$1"><code>$2</code></pre>'
            );
            
            return formattedHtml;
        } catch (error) {
            console.error('Markdown 渲染错误:', error);
            return content.replace(/\n/g, '<br>');
        }
    }

    exportChat() {
        const messages = Array.from(this.chatMessages.children).map(msg => {
            const role = msg.classList.contains('user-message') ? 'User' : 
                        msg.classList.contains('ai-message') ? 'AI' : 'System';
            const content = msg.querySelector('.message-content').textContent;
            return `${role}: ${content}\n`;
        }).join('\n');

        const blob = new Blob([messages], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `chat-export-${new Date().toISOString().slice(0,10)}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
}

// 辅助函数
function updateTokenCount(current, max) {
    const tokenCountEl = document.getElementById('tokenCount');
    if (tokenCountEl) {
        tokenCountEl.textContent = `${current}/${max}`;
        tokenCountEl.className = `token-count ${current > max * 0.9 ? 'token-count-warning' : ''}`;
    }
}

function showLoading(message = '处理中...') {
    const loadingEl = document.querySelector('.loading-overlay') || 
        document.createElement('div');
    loadingEl.className = 'loading-overlay';
    loadingEl.style.backgroundColor = 'rgba(0, 0, 0, 0.3)';  // 半透明背景
    loadingEl.innerHTML = `
        <div class="loading-content">
            <div class="loading-spinner"></div>
            <div class="loading-message">${message}</div>
        </div>
    `;
    if (!document.querySelector('.loading-overlay')) {
        document.body.appendChild(loadingEl);
    }
}

function hideLoading() {
    const loadingEl = document.querySelector('.loading-overlay');
    if (loadingEl) loadingEl.remove();
}

function getCookie(name) {
    let cookieValue = null;
    if (document.cookie && document.cookie !== '') {
        const cookies = document.cookie.split(';');
        for (let i = 0; i < cookies.length; i++) {
            const cookie = cookies[i].trim();
            if (cookie.substring(0, name.length + 1) === (name + '=')) {
                cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
                break;
            }
        }
    }
    return cookieValue;
}
// 初始化代码
document.addEventListener('DOMContentLoaded', function() {
    // 初始化全局变量
    processedData = document.getElementById('processedData');
    resultTable = document.getElementById('resultTable');
    
    // 初始化管理器
    window.dimensionManager = new DimensionManager();
    window.apiConfigManager = new APIConfigManager();
    window.chatManager = new ChatManager();
    window.fileProcessor = new FileProcessor();
});


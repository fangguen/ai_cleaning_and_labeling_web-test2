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
        this.processBtn = document.getElementById('processButton');
        this.fileInput = document.getElementById('fileInput');
        this.fileLabel = document.querySelector('.custom-file-label');
        this.originalData = document.getElementById('originalData');
        this.processedData = document.getElementById('processedData');
        this.isProcessing = false;
        
        this.exportBtn = document.getElementById('exportBtn');
        
        this.setupEventListeners();
        console.log('FileProcessor initialized');
        this.currentResult = null;  // 存储当前处理结果
    }

    setupEventListeners() {
        // 件选择事件
        this.fileInput?.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                // 更新文件名显示
                this.fileLabel.textContent = file.name;
                this.handleFileUpload(e);
            }
        });

        this.processBtn?.addEventListener('click', () => this.processFile());

        this.exportBtn?.addEventListener('click', () => this.exportProcessedData());
    }

    getProcessType() {
        const radioBtn = document.querySelector('input[name="processType"]:checked');
        return radioBtn ? radioBtn.value : 'cleaning';
    }

    async handleFileUpload(e) {
        const file = e.target.files[0];
        if (!file) {
            showError('请选择文件');
            return;
        }

        try {
            showLoading('正在上传文件...');
            const formData = new FormData();
            formData.append('file', file);

            const response = await fetch('/upload-file/', {
                method: 'POST',
                headers: {
                    'X-CSRFToken': getCookie('csrftoken')
                },
                body: formData
            });

            const data = await response.json();
            console.log('上传响应:', data);  // 添加日志
            
            if (response.ok && data.content) {
                this.originalData.value = data.content;
                showSuccess('文件上传成功');
            } else {
                throw new Error(data.error || '文件上传失败');
            }
        } catch (e) {
            console.error('文件上传错误:', e);
            showError(e.message);
        } finally {
            hideLoading();
        }
    }

    async processFile() {
        if (this.isProcessing) {
            showError('已有处理任务在进行中');
            return;
        }

        const content = this.originalData.value;
        if (!content) {
            showError('请先上传文件');
            return;
        }

        try {
            this.isProcessing = true;
            showLoading('正在处理文件...');

            // 获取选中的维度
            const selectedDimensions = [];
            document.querySelectorAll('.dimension-item input[type="checkbox"]:checked').forEach(checkbox => {
                selectedDimensions.push(checkbox.value);
            });

            if (selectedDimensions.length === 0) {
                throw new Error('请至少选择一个处理维度');
            }

            // 获取API配置
            const apiConfig = await this.getAPIConfig();
            if (!apiConfig) {
                throw new Error('请先配置API');
            }

            console.log('处理请求参数:', {
                content: content,
                process_type: this.getProcessType(),
                service_type: apiConfig.service_type,
                api_key: apiConfig.api_key,
                dimensions: selectedDimensions
            });

            const response = await fetch('/process-file/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': getCookie('csrftoken')
                },
                body: JSON.stringify({
                    content: content,
                    process_type: this.getProcessType(),
                    service_type: apiConfig.service_type,
                    api_key: apiConfig.api_key,
                    dimensions: selectedDimensions
                })
            });

            const data = await response.json();
            console.log('处理响应:', data);

            if (!response.ok) {
                throw new Error(data.error || '处理失败');
            }

            if (data.processing_key) {
                this.startPolling(data.processing_key);
            } else {
                throw new Error('未获取到处理标识');
            }

        } catch (e) {
            console.error('处理错误:', e);
            showError(e.message);
        } finally {
            hideLoading();
            this.isProcessing = false;
        }
    }

    async getAPIConfig() {
        try {
            const response = await fetch('/get-api-config/');
            if (!response.ok) {
                throw new Error('获取API配置失败');
            }
            return await response.json();
        } catch (e) {
            console.error('获取API配置错误:', e);
            return null;
        }
    }

    getProcessType() {
        const radioBtn = document.querySelector('input[name="processType"]:checked');
        return radioBtn ? radioBtn.value : 'cleaning';
    }

    async handleFileUpload(e) {
        const file = e.target.files[0];
        if (!file) {
            showError('请选择文件');
            return;
        }

        try {
            showLoading('正在上传文件...');
            const formData = new FormData();
            formData.append('file', file);

            const response = await fetch('/upload-file/', {
                method: 'POST',
                headers: {
                    'X-CSRFToken': getCookie('csrftoken')
                },
                body: formData
            });

            const data = await response.json();
            console.log('上传响应:', data);  // 添加日志
            
            if (response.ok && data.content) {
                this.originalData.value = data.content;
                showSuccess('文件上传成功');
            } else {
                throw new Error(data.error || '文件上传失败');
            }
        } catch (e) {
            console.error('文件上传错误:', e);
            showError(e.message);
        } finally {
            hideLoading();
        }
    }

    async startPolling(processingKey) {
        let attempts = 0;
        const maxAttempts = 180;
        
        while (attempts < maxAttempts) {
            try {
                const response = await fetch(`/check-processing-status/${processingKey}/`);
                const data = await response.json();
                
                if (data.status === 'completed') {
                    console.log('处理完成，结果:', data);
                    this.currentResult = data;  // 保存结果
                    this.displayResult(data.result);
                    showSuccess('处理完成！');
                    this.exportBtn.disabled = false;
                    break;
                } else if (data.status === 'failed') {
                    throw new Error(data.error || '处理失败');
                }
                
                attempts++;
                await new Promise(resolve => setTimeout(resolve, 10000));
            } catch (e) {
                console.error('轮询错误:', e);
                showError(e.message);
                break;
            }
        }
    }

    displayResult(result) {
        try {
            let data = typeof result === 'string' ? JSON.parse(result) : result;
            
            // 更新处理结果文本区域
            this.processedData.value = JSON.stringify(data, null, 2);
            
            // 更新结果表格
            if (resultTable) {
                let tableHtml = `
                    <thead>
                        <tr>
                            <th width="5%">序号</th>
                            <th width="45%">输入文本</th>
                            <th width="45%">处理结果</th>
                        </tr>
                    </thead>
                    <tbody>
                `;
                
                if (Array.isArray(data)) {
                    data.forEach((item, index) => {
                        tableHtml += `
                            <tr>
                                <td>${index + 1}</td>
                                <td><pre class="text-wrap">${item.input || ''}</pre></td>
                                <td><pre class="text-wrap">${item.output || ''}</pre></td>
                            </tr>
                        `;
                    });
                } else {
                    tableHtml += `
                        <tr>
                            <td>1</td>
                            <td><pre class="text-wrap">${data.input || ''}</pre></td>
                            <td><pre class="text-wrap">${data.output || ''}</pre></td>
                        </tr>
                    `;
                }
                
                tableHtml += '</tbody>';
                resultTable.innerHTML = tableHtml;
            }
        } catch (e) {
            console.error('解析结果失败:', e);
            showError('解析处理结果失败');
        }
    }

    async exportProcessedData() {
        if (!this.currentResult) {
            showError('没有可导出的结果');
            return;
        }

        try {
            const response = await fetch('/export-processed-data/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': getCookie('csrftoken')
                },
                body: JSON.stringify({
                    process_type: this.currentResult.process_type,
                    original_data: this.originalData.value,
                    processed_result: this.currentResult.result,
                    timestamp: this.currentResult.timestamp
                })
            });

            if (response.ok) {
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `processed_data_${new Date().toISOString().slice(0,19).replace(/[:]/g, '')}.json`;
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                a.remove();
            } else {
                throw new Error('导出失败');
            }
        } catch (e) {
            console.error('导出错误:', e);
            showError('导出失败: ' + e.message);
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
        this.typingSpeed = 8
        
        this.setupEventListeners();
        
        // 生成新的话ID
        this.sessionId = 'chat_' + new Date().getTime() + '_' + Math.random().toString(36).substr(2, 9);
        
        // 初始消息也需要使用session_id
        this.appendMessage('ai', '你好！我是AI助手，有什么可以帮你的吗？', this.sessionId);
        
        // 配置 marked
        marked.setOptions({
            highlight: (code, lang) => {
                if (Prism.languages[lang]) {
                    return Prism.highlight(code, Prism.languages[lang], lang);
                }
                return code;
            },
            breaks: true,
            gfm: true
        });

        // 自定义渲染器
        const renderer = new marked.Renderer();
        
        // 自定义代码块渲染
        renderer.code = (code, language = 'plaintext') => {
            const validLanguage = Prism.languages[language] ? language : 'plaintext';
            const languageClass = `language-${validLanguage}`;
            
            return `
                <div class="code-block">
                    <div class="code-header">
                        <span class="code-language">${validLanguage}</span>
                        <button class="copy-button" onclick="copyCode(this)">
                            <i class="fas fa-copy"></i>
                            <span class="copy-tooltip">复制代码</span>
                        </button>
                    </div>
                    <pre class="${languageClass}"><code class="${languageClass}">${code}</code></pre>
                </div>
            `;
        };

        // 数学公式渲染
        const renderMath = (tex, displayMode) => {
            try {
                return katex.renderToString(tex, {
                    displayMode: displayMode,
                    throwOnError: false,
                    output: 'html',
                    trust: true,
                    strict: false,
                    macros: {
                        "\\matrix": "\\begin{pmatrix}#1\\end{pmatrix}",
                        "\\pmatrix": "\\begin{pmatrix}#1\\end{pmatrix}"
                    }
                });
            } catch (e) {
                console.error('Math rendering error:', e);
                return tex;
            }
        };

        // 处理消息内容
        this.processMessageContent = (content) => {
            // 配置 marked 使用 highlight.js
            marked.setOptions({
                highlight: function(code, lang) {
                    if (lang && hljs.getLanguage(lang)) {
                        return hljs.highlight(code, { language: lang }).value;
                    }
                    return code;
                }
            });

            // 渲染 Markdown
            const htmlContent = DOMPurify.sanitize(marked(content));
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = htmlContent;

            // 渲染数学公式
            renderMathInElement(tempDiv, {
                delimiters: [
                    {left: '$$', right: '$$', display: true},
                    {left: '$', right: '$', display: false},
                    {left: '\\[', right: '\\]', display: true},
                    {left: '\\(', right: '\\)', display: false}
                ],
                throwOnError: false,
                trust: true,
                strict: false,
                macros: {
                    "\\matrix": "\\begin{pmatrix}#1\\end{pmatrix}",
                    "\\pmatrix": "\\begin{pmatrix}#1\\end{pmatrix}"
                }
            });

            // 确保代码块有正确的类名
            tempDiv.querySelectorAll('pre code').forEach((block) => {
                hljs.highlightElement(block);
            });

            return tempDiv.innerHTML;
        };
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

    // 统一的消息添加方法
    async appendMessage(role, content) {
        if (!content || !this.chatMessages) return;

        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${role}-message`;
        
        // 创建消息头部（头像）
        const iconDiv = document.createElement('div');
        iconDiv.className = 'message-icon';
        iconDiv.innerHTML = role === 'user' ? '<i class="fas fa-user"></i>' : '<i class="fas fa-robot"></i>';
        
        // 创建消息内容容器
        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content markdown-body';
        
        messageDiv.appendChild(iconDiv);
        messageDiv.appendChild(contentDiv);
        this.chatMessages.appendChild(messageDiv);

        if (role === 'user') {
            // 用户消息直接显示，不需要特殊渲染
            contentDiv.textContent = content;
        } else {
            // AI消息需要渲染Markdown和数学公式
            await this.typeMessage(content, contentDiv);
        }

        this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
    }

    async typeMessage(content, element) {
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
        
        // 渲染Markdown和清理HTML
        const htmlContent = DOMPurify.sanitize(marked.parse(content));
        
        // 创建临时div解析HTML
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = htmlContent;
        
        element.innerHTML = '';
        
        // 逐字显示内容
        await this.typeNode(tempDiv, element);
        
        // 渲染数学公式
        renderMathInElement(element, {
            delimiters: [
                {left: '$$', right: '$$', display: true},
                {left: '$', right: '$', display: false}
            ],
            throwOnError: false
        });
        
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
                const text = node.textContent;
                const textNode = document.createTextNode('');
                targetParent.appendChild(textNode);
                
                for (let i = 0; i < text.length; i++) {
                    textNode.textContent += text[i];
                    await new Promise(resolve => setTimeout(resolve, this.typingSpeed));
                    this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
                }
            } else {
                const newElement = document.createElement(node.tagName);
                for (const attr of node.attributes || []) {
                    newElement.setAttribute(attr.name, attr.value);
                }
                targetParent.appendChild(newElement);
                await this.typeNode(node, newElement);
            }
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

    // 添加消息到聊天窗口
    async addMessage(message, isAI = false) {
        const messageDiv = document.createElement('div');
        messageDiv.className = isAI ? 'ai-message' : 'user-message';
        
        // 创建头像元素
        const avatarDiv = document.createElement('div');
        avatarDiv.className = 'avatar';
        avatarDiv.innerHTML = `<i class="fas fa-${isAI ? 'robot' : 'user'}"></i>`;
        
        // 创建消息内容元素
        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content markdown-body';
        
        if (isAI) {
            contentDiv.innerHTML = this.processMessageContent(message);
            await this.typewriterEffect(contentDiv, message);
        } else {
            contentDiv.textContent = message;
        }
        
        // 按照不同的顺序添加元素
        if (isAI) {
            messageDiv.appendChild(avatarDiv);
            messageDiv.appendChild(contentDiv);
        } else {
            messageDiv.appendChild(contentDiv);
            messageDiv.appendChild(avatarDiv);
        }
        
        this.chatMessages.appendChild(messageDiv);
        this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
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
    const statusBar = document.querySelector('.status-bar') || document.createElement('div');
    statusBar.className = 'status-bar';
    statusBar.textContent = message;
    document.body.appendChild(statusBar);
}

function hideLoading() {
    const statusBar = document.querySelector('.status-bar');
    if (statusBar) statusBar.remove();
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
    
    // 始化管理器
    window.dimensionManager = new DimensionManager();
    window.apiConfigManager = new APIConfigManager();
    window.chatManager = new ChatManager();
    window.fileProcessor = new FileProcessor();
});

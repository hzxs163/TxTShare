// ===== 使用全局 API 地址 =====
const API_BASE_URL = window.API_BASE_URL || '';

// ===== 等待 DOM 加载完成后初始化 =====
document.addEventListener('DOMContentLoaded', function() {

    // ===== DOM Elements =====
    const contentInput = document.getElementById('content');
    const titleInput = document.getElementById('title');
    const expireSelect = document.getElementById('expire');
    const shareTypeSelect = document.getElementById('shareType');
    const burnAfterReadingCheckbox = document.getElementById('burnAfterReading');
    const previewTitle = document.getElementById('previewTitle');
    const previewContent = document.getElementById('previewContent');
    const previewCreatedAt = document.getElementById('previewCreatedAt');
    const previewExpiresAt = document.getElementById('previewExpiresAt');
    const burnIndicator = document.getElementById('burnIndicator');
    const shareOptions = document.getElementById('shareOptions');
    const qrcodeContainer = document.getElementById('qrcodeContainer');
    const qrcodeImage = document.getElementById('qrcodeImage');
    const linkContainer = document.getElementById('linkContainer');
    const shareLink = document.getElementById('shareLink');
    const copyLinkBtn = document.getElementById('copyLinkBtn');
    const clipboardMessage = document.getElementById('clipboardMessage');
    const shareForm = document.getElementById('shareForm');
    const charCount = document.getElementById('charCount');
    // ✅ 新增：获取密码输入框
    const passwordInput = document.getElementById('password');

    // 如果 shareForm 不存在，直接报错退出
    if (!shareForm) {
        console.error('❌ shareForm 元素未找到，请检查 HTML');
        return;
    }

    // ===== Theme Toggle =====
    const themeToggle = document.getElementById('themeToggle');
    if (themeToggle) {
        const htmlElement = document.documentElement;
        const iconElement = themeToggle.querySelector('i');

        if (localStorage.getItem('theme') === 'dark' || 
            (!localStorage.getItem('theme') && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
            htmlElement.setAttribute('data-theme', 'dark');
            iconElement.classList.remove('fa-moon-o');
            iconElement.classList.add('fa-sun-o');
        } else {
            htmlElement.removeAttribute('data-theme');
            iconElement.classList.remove('fa-sun-o');
            iconElement.classList.add('fa-moon-o');
        }

        themeToggle.addEventListener('click', () => {
            if (htmlElement.hasAttribute('data-theme')) {
                htmlElement.removeAttribute('data-theme');
                localStorage.setItem('theme', 'light');
                iconElement.classList.remove('fa-sun-o');
                iconElement.classList.add('fa-moon-o');
            } else {
                htmlElement.setAttribute('data-theme', 'dark');
                localStorage.setItem('theme', 'dark');
                iconElement.classList.remove('fa-moon-o');
                iconElement.classList.add('fa-sun-o');
            }
        });
    }

    // ===== Utility Functions =====
    function formatDateTime(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        const seconds = String(date.getSeconds()).padStart(2, '0');
        return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
    }

    function updateExpireTime() {
        const now = new Date();
        // 注意：expireSelect 的值现在是文字（如"1天"），不再用于计算
        // 预览中的过期时间由后端返回，这里只做显示占位
        const expireDays = 7; // 默认7天
        const expiresAt = new Date(now);
        expiresAt.setDate(expiresAt.getDate() + expireDays);
        previewExpiresAt.textContent = formatDateTime(expiresAt);
    }

    // ===== Debounce =====
    let debounceTimer;

    function updatePreview() {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            const title = titleInput.value.trim();
            const content = contentInput.value.trim();
            previewTitle.textContent = title || '无标题';
            previewContent.textContent = content || '在这里输入内容以查看预览...';
            charCount.textContent = content.length;
            if (burnAfterReadingCheckbox.checked) {
                burnIndicator.classList.remove('hidden');
            } else {
                burnIndicator.classList.add('hidden');
            }
            localStorage.setItem('draft_content', content);
            localStorage.setItem('draft_title', title);
        }, 300);
    }

    function restoreDraft() {
        const savedContent = localStorage.getItem('draft_content');
        const savedTitle = localStorage.getItem('draft_title');
        if (savedContent) {
            contentInput.value = savedContent;
            titleInput.value = savedTitle || '';
            updatePreview();
        }
    }

    // ===== Copy Functions =====
    function showClipboardMessage(text) {
        const span = clipboardMessage.querySelector('span');
        if (span) span.textContent = text || '已复制到剪贴板';
        clipboardMessage.classList.add('show');
        setTimeout(() => {
            clipboardMessage.classList.remove('show');
        }, 2000);
    }

    function copyToClipboard(text, message) {
        if (navigator.clipboard) {
            navigator.clipboard.writeText(text).then(() => {
                showClipboardMessage(message);
            }).catch(() => {
                fallbackCopy(text, message);
            });
        } else {
            fallbackCopy(text, message);
        }
    }

    function fallbackCopy(text, message) {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        try {
            document.execCommand('copy');
            showClipboardMessage(message);
        } catch (e) {
            alert('复制失败，请手动复制');
        }
        document.body.removeChild(textarea);
    }

    // ===== Generate QR Code (修复版) =====
    function generateQRCode(text) {
        if (typeof QRCode === 'undefined') {
            console.error('QRCode library not loaded');
            showClipboardMessage('二维码库加载失败，请刷新重试');
            return;
        }
        
        try {
            // 使用 toCanvas 方法（qrcode@1.5.1 支持）
            const canvas = document.createElement('canvas');
            QRCode.toCanvas(canvas, text, {
                width: 200,
                margin: 1,
                color: {
                    dark: '#2d3748',
                    light: '#ffffff'
                }
            }, function(error) {
                if (error) {
                    console.error('生成二维码失败:', error);
                    showClipboardMessage('二维码生成失败: ' + error.message);
                    return;
                }
                // 将 canvas 转为图片 URL
                qrcodeImage.src = canvas.toDataURL('image/png');
                qrcodeContainer.classList.remove('hidden');
            });
        } catch (error) {
            console.error('QRCode 生成异常:', error);
            showClipboardMessage('二维码生成异常，请重试');
        }
    }

    // ===== 过期时间映射 =====
    function getExpiresIn(value) {
        const map = {
            '5分钟': 5 * 60,
            '10分钟': 10 * 60,
            '1小时': 3600,
            '1天': 86400,
            '1周': 7 * 86400,
            '1个月': 30 * 86400,
            '1年': 365 * 86400,
            '永不过期': 0
        };
        return map[value] || 7 * 86400;
    }

    // ===== Form Submit =====
    let lastSubmitTime = 0;

    shareForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        console.log('✅ 表单提交事件已触发');

        const now = Date.now();
        if (now - lastSubmitTime < 5000) {
            showClipboardMessage('操作过于频繁，请稍后再试');
            return;
        }
        lastSubmitTime = now;

        const content = contentInput.value.trim();
        const title = titleInput.value.trim() || '分享内容';
        const password = passwordInput ? passwordInput.value.trim() : '';

        if (!content) {
            showClipboardMessage('请输入要分享的内容');
            return;
        }

        if (content.length > 10000) {
            showClipboardMessage('内容过长，请缩减至10000字符以内');
            return;
        }

        try {
            console.log('📤 发送请求到 /api/create');
            const response = await fetch('/api/create', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    title: title,
                    content: content,
                    expiresIn: getExpiresIn(expireSelect.value),
                    burnAfterRead: burnAfterReadingCheckbox.checked,
                    password: password  // ✅ 新增：发送密码
                })
            });

            console.log('📥 响应状态:', response.status);

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`HTTP ${response.status}: ${errorText}`);
            }

            const data = await response.json();

            if (!data.success) {
                throw new Error(data.message || '创建失败');
            }

            localStorage.removeItem('draft_content');
            localStorage.removeItem('draft_title');

            shareOptions.classList.remove('hidden');

            // ✅ 修改：直接使用后端返回的短链接
            const shareUrl = data.shareUrl;
            const shareType = shareTypeSelect.value;

            if (shareType === 'both' || shareType === 'link') {
                shareLink.textContent = shareUrl;
                linkContainer.classList.remove('hidden');
            } else {
                linkContainer.classList.add('hidden');
            }

            if (shareType === 'both' || shareType === 'qrcode') {
                generateQRCode(shareUrl);
            } else {
                qrcodeContainer.classList.add('hidden');
            }

            showClipboardMessage('🎉 分享创建成功！');

        } catch (error) {
            console.error('❌ 创建分享失败:', error);
            showClipboardMessage('创建失败: ' + error.message);
        }
    });

    // ===== Copy Link Button =====
    if (copyLinkBtn) {
        copyLinkBtn.addEventListener('click', () => {
            const link = shareLink.textContent;
            if (link) {
                copyToClipboard(link, '链接已复制到剪贴板');
            }
        });
    }

    // ===== Initialization =====
    const now = new Date();
    previewCreatedAt.textContent = formatDateTime(now);
    updateExpireTime();
    restoreDraft();

    // ===== Event Listeners =====
    titleInput.addEventListener('input', updatePreview);
    contentInput.addEventListener('input', updatePreview);
    expireSelect.addEventListener('change', () => {
        // 预览中的过期时间显示（仅做展示，实际过期由后端控制）
        updateExpireTime();
        updatePreview();
    });
    burnAfterReadingCheckbox.addEventListener('change', updatePreview);

    console.log('✅ app.js 加载完成，所有事件已绑定');
});

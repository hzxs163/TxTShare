// ===== 配置 =====
const API_BASE_URL = 'https://txtaip.step.cc.cd';

// ===== 主题切换 =====
const themeToggle = document.createElement('button');
themeToggle.id = 'themeToggle';
themeToggle.className = 'theme-toggle';
themeToggle.innerHTML = '<i class="fa fa-moon-o"></i>';

const htmlElement = document.documentElement;
if (localStorage.getItem('theme') === 'dark' || 
    (!localStorage.getItem('theme') && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
    htmlElement.setAttribute('data-theme', 'dark');
    themeToggle.querySelector('i').classList.remove('fa-moon-o');
    themeToggle.querySelector('i').classList.add('fa-sun-o');
}

themeToggle.addEventListener('click', () => {
    if (htmlElement.hasAttribute('data-theme')) {
        htmlElement.removeAttribute('data-theme');
        localStorage.setItem('theme', 'light');
        themeToggle.querySelector('i').classList.remove('fa-sun-o');
        themeToggle.querySelector('i').classList.add('fa-moon-o');
    } else {
        htmlElement.setAttribute('data-theme', 'dark');
        localStorage.setItem('theme', 'dark');
        themeToggle.querySelector('i').classList.remove('fa-moon-o');
        themeToggle.querySelector('i').classList.add('fa-sun-o');
    }
});

// ===== 通知 =====
function showNotification(message) {
    const notification = document.getElementById('copyNotification');
    const notificationText = document.getElementById('notificationText');
    notificationText.textContent = message;
    notification.classList.add('show');
    setTimeout(() => {
        notification.classList.remove('show');
    }, 3000);
}

// ===== 复制 =====
function copyText() {
    const text = document.querySelector('.text-input')?.textContent;
    if (text) {
        if (navigator.clipboard) {
            navigator.clipboard.writeText(text).then(() => {
                showNotification('文本已复制');
            }).catch(() => {
                fallbackCopy(text, '文本已复制');
            });
        } else {
            fallbackCopy(text, '文本已复制');
        }
    }
}

function copyLink() {
    const link = window.location.href;
    if (navigator.clipboard) {
        navigator.clipboard.writeText(link).then(() => {
            showNotification('链接已复制');
        }).catch(() => {
            fallbackCopy(link, '链接已复制');
        });
    } else {
        fallbackCopy(link, '链接已复制');
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
        showNotification(message);
    } catch (e) {
        showNotification('复制失败，请手动复制');
    }
    document.body.removeChild(textarea);
}

// ===== 渲染内容 =====
function renderContent(data) {
    const container = document.getElementById('contentContainer');
    
    let html = '';
    
    // 阅后即焚提示
    if (data.burnAfterRead && data.isRead) {
        html += `
        <div class="burn-notice">
            <i class="fa fa-exclamation-triangle"></i>
            <span>该内容为阅后即焚，关闭页面后将无法再次查看</span>
        </div>
        `;
    }
    
    // 头部
    html += `
    <div class="header">
        <h1>分享的文本</h1>
        ${themeToggle.outerHTML}
    </div>
    
    <div class="time-info">
        创建时间：${data.createdAt}
        ${data.expireTime}后过期
    </div>
    `;
    
    // 标题
    if (data.title) {
        html += `<div class="text-title">${escapeHtml(data.title)}</div>`;
    }
    
    // 文本内容
    html += `
    <div class="section">
        <div class="section-header">
            <div class="section-title">文本内容</div>
            <button class="copy-btn copy-text-btn" onclick="copyText()">复制文本</button>
        </div>
        <div class="content-box">
            <div class="text-input">${escapeHtml(data.content)}</div>
        </div>
    </div>
    
    <div class="divider"></div>
    
    <div class="section">
        <div class="section-header">
            <div class="section-title">分享链接</div>
            <button class="copy-btn copy-link-btn" onclick="copyLink()">复制链接</button>
        </div>
        <div class="content-box">
            <div class="text-input">${escapeHtml(data.shareUrl)}</div>
        </div>
    </div>
    `;
    
    container.innerHTML = html;
    
    // 重新绑定主题切换事件
    const newThemeToggle = document.getElementById('themeToggle');
    if (newThemeToggle) {
        newThemeToggle.addEventListener('click', themeToggle.onclick);
    }
}

// ===== XSS防护 =====
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ===== 渲染错误 =====
function renderError(message) {
    const container = document.getElementById('contentContainer');
    container.innerHTML = `
    <div class="error-container">
        <i class="fa fa-times-circle"></i>
        <h2>出错了</h2>
        <p>${escapeHtml(message)}</p>
    </div>
    `;
}

// ===== 加载分享内容 =====
async function loadShareContent() {
    const urlParams = new URLSearchParams(window.location.search);
    const id = urlParams.get('id');
    
    if (!id) {
        renderError('无效的分享ID');
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE_URL}/api/view?id=${id}`);
        const result = await response.json();
        
        if (result.success) {
            renderContent(result.data);
        } else {
            renderError(result.message || '分享内容不存在或已过期');
        }
    } catch (error) {
        renderError('加载失败，请检查网络或稍后重试');
        console.error(error);
    }
}

// ===== 初始化 =====
window.addEventListener('DOMContentLoaded', loadShareContent);
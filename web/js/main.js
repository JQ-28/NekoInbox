import { fetchMessages, fetchConfig, setTurnstileToken } from './api.js';
import { renderMessages, showLoader, hideLoader, clearMessageBoard, resizeGridItems, updateLoginButtonState, renderSkeleton } from './ui.js';
import { initializeEventListeners } from './events.js';
import { LOCAL_STORAGE_KEYS, DEFAULTS } from './constants.js';

let currentPage = 1;
let totalPages = 1;
let isLoading = false;
const searchInput = document.getElementById('search-input');

export async function loadMessages(isInitialLoad = false) {
    if (isLoading || (currentPage > totalPages && !isInitialLoad)) return;
    isLoading = true;
    
    if (isInitialLoad) {
        const messageElements = document.querySelectorAll('#messageBoard .message');
        if (messageElements.length > 0) {
            messageElements.forEach(card => card.classList.add('hiding'));
            await new Promise(resolve => setTimeout(resolve, 300)); // 等待动画
        }
        clearMessageBoard();
        renderSkeleton(DEFAULTS.MESSAGES_PER_PAGE);
    } else {
        showLoader();
    }

    try {
        const { searchTerm, filterByTag, sortBy } = getCurrentFilters();
        const data = await fetchMessages(currentPage, DEFAULTS.MESSAGES_PER_PAGE, sortBy, filterByTag, searchTerm);
        
        if (isInitialLoad) {
            clearMessageBoard(); // 移除骨架屏
        }

        renderMessages(data.messages, currentPage);
        totalPages = data.totalPages;
        currentPage++;

    } catch (error) {
        console.error('获取消息失败:', error);
        if (isInitialLoad) {
            clearMessageBoard(); // 移除骨架屏
            messageBoard.innerHTML = '<p class="error-message">加载数据失败，请稍后再试。</p>';
        }
    } finally {
        isLoading = false;
        hideLoader();
    }
}

export async function performSearch() {
    currentPage = 1;
    totalPages = 1;
    isLoading = false;
    // 始终将搜索视为一次初始加载
    await loadMessages(true);
}

export async function initializePage() {
    currentPage = 1;
    totalPages = 1;
    isLoading = false;
    searchInput.value = '';
    await loadMessages(true);
    updateLoginButtonState();
    window.addEventListener('resize', resizeGridItems);
}

async function start() {
    const turnstileModal = document.getElementById('turnstile-modal');
    turnstileModal.style.display = 'flex';
    try {
        const config = await fetchConfig();
        if (config.turnstileSiteKey && window.turnstile) {
            window.turnstile.render('#turnstile-widget-container', {
                sitekey: config.turnstileSiteKey,
                callback: function(token) {
                    setTurnstileToken(token);
                    turnstileModal.style.display = 'none';
                    initializePage();
                },
            });
            const loadingText = document.querySelector('.turnstile-loading');
            if(loadingText) loadingText.style.display = 'none';
        } else {
            throw new Error('Turnstile Site Key 未配置或 Turnstile 脚本加载失败');
        }
    } catch (error) {
        console.error('Turnstile 初始化失败:', error);
        const container = document.getElementById('turnstile-widget-container');
        if(container) {
            container.innerHTML = `<p class="error">人机验证加载失败，请刷新页面或联系管理员。</p>`;
        }
    }
}

export function getCurrentFilters() {
    const searchTerm = searchInput.value.trim();
    const filterByTag = document.querySelector('#custom-tag-filter .select-selected span').dataset.value;
    const sortBy = document.querySelector('#custom-sort-by .select-selected span').dataset.value;
    return { searchTerm, filterByTag, sortBy };
}

// --- 暗色模式 & 星空背景 ---
// 我知道这个很酷，你也是这么想的对吧？
const toggle = document.getElementById('input');
const body = document.body;

function createStarfield() {
    const count = 300;
    const starsContainer = document.getElementById('stars');
    if (!starsContainer) return;
    starsContainer.innerHTML = '';
    for (let i = 0; i < count; i++) {
        const star = document.createElement('i');
        const xRatio = Math.random();
        const yRatio = Math.random();
        const size = Math.random() * 5;
        const duration = Math.random() * 2;

        star.dataset.x = xRatio;
        star.dataset.y = yRatio;

        star.style.left = Math.floor(xRatio * window.innerWidth) + 'px';
        star.style.top = Math.floor(yRatio * window.innerHeight) + 'px';
        star.style.height = 1 + size + 'px';
        star.style.width = 1 + size + 'px';
        star.style.animationDuration = 2 + duration + 's';
        starsContainer.appendChild(star);
    }
}

function updateStarfieldPositions() {
    const starsContainer = document.getElementById('stars');
    if (!starsContainer) return;

    starsContainer.querySelectorAll('i').forEach(star => {
        const xRatio = parseFloat(star.dataset.x);
        const yRatio = parseFloat(star.dataset.y);
        star.style.left = Math.floor(xRatio * window.innerWidth) + 'px';
        star.style.top = Math.floor(yRatio * window.innerHeight) + 'px';
    });
}

export function setDarkMode(isDark) {
    const starsContainer = document.getElementById('stars');
    if (isDark) {
        body.classList.add('dark-mode');
        toggle.checked = true;
        localStorage.setItem(LOCAL_STORAGE_KEYS.THEME, 'dark');
        if (starsContainer && starsContainer.children.length === 0) {
            createStarfield();
        }
    } else {
        body.classList.remove('dark-mode');
        toggle.checked = false;
        localStorage.setItem(LOCAL_STORAGE_KEYS.THEME, 'light');
        if (starsContainer) {
            starsContainer.innerHTML = '';
        }
    }
}

export function debounce(func, wait) {
    let timeout;
    const debounced = function(...args) {
        const later = () => {
            clearTimeout(timeout);
            func.apply(this, args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
    debounced.cancel = () => {
        clearTimeout(timeout);
    };
    return debounced;
}

export const handleResize = debounce(() => {
    if (body.classList.contains('dark-mode')) {
        updateStarfieldPositions();
    }
}, 250);


document.addEventListener('DOMContentLoaded', () => {
    const savedTheme = localStorage.getItem(LOCAL_STORAGE_KEYS.THEME);
    if (savedTheme) {
        setDarkMode(savedTheme === 'dark');
    } else {
        const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
        setDarkMode(prefersDark);
    }
    
    initializeEventListeners();
    start();
});
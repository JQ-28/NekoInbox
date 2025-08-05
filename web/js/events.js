// 事件总指挥
// 页面上所有的点击、滚动、输入等用户操作的响应逻辑都在这里。

import { handleVote, handleReport, handleDelete, handleSetTag, submitReply, login, getAuthToken, setAuthToken, AuthError } from './api.js';
import { showToast } from './ui.js';
import { initializePage, performSearch, setDarkMode, handleResize, loadMessages, getCurrentFilters, debounce } from './main.js';
import { LOCAL_STORAGE_KEYS, UI } from './constants.js';

const messageBoard = document.getElementById('messageBoard');
const searchInput = document.getElementById('search-input');
const clearSearchBtn = document.getElementById('clear-search-btn');
const searchBtn = document.getElementById('search-btn');
const loginModal = document.getElementById('login-modal');
const closeBtn = document.querySelector('.close-btn');
const submitLoginBtn = document.getElementById('submit-login-btn');
const passwordInput = document.getElementById('password-input');
const loginError = document.getElementById('login-error');
const loginBtn = document.getElementById('admin-login-btn');
const toggle = document.getElementById('input');
const backToTopBtn = document.getElementById('back-to-top-btn');

const debouncedSearch = debounce(() => {
    performSearch();
}, 300);

export function initializeEventListeners() {
    messageBoard.addEventListener('click', handleMessageBoardClick);
    messageBoard.addEventListener('mouseover', handleMessageBoardMouseOver);
    messageBoard.addEventListener('mouseout', handleMessageBoardMouseOut);
    messageBoard.addEventListener('change', handleMessageBoardChange);
    
    searchInput.addEventListener('input', handleSearchInput);
    searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            debouncedSearch.cancel();
            performSearch();
        }
    });

    clearSearchBtn.addEventListener('click', handleClearSearch);
    searchBtn.addEventListener('click', () => {
        debouncedSearch.cancel();
        performSearch();
    });
    
    loginBtn.addEventListener('click', handleLoginButtonClick);
    closeBtn.onclick = () => loginModal.style.display = 'none';
    window.onclick = (event) => {
        if (event.target == loginModal) loginModal.style.display = 'none';
    };
    submitLoginBtn.onclick = handleLoginSubmit;
    
    toggle.addEventListener('change', (e) => setDarkMode(e.target.checked));
    
    window.addEventListener('resize', handleResize);
    
    setupCustomSelects();

    window.addEventListener('scroll', throttle(() => {
        // Infinite scroll
        if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - UI.SCROLL_THRESHOLD) {
            loadMessages(false);
        }
        // Back to top button visibility
        if (window.scrollY > window.innerHeight) {
            backToTopBtn.classList.add('show');
        } else {
            backToTopBtn.classList.remove('show');
        }
    }, 200));

    backToTopBtn.addEventListener('click', () => {
        window.scrollTo({
            top: 0,
            behavior: 'smooth'
        });
    });
}

function throttle(func, limit) {
    let inThrottle;
    return function() {
        const args = arguments;
        const context = this;
        if (!inThrottle) {
            func.apply(context, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
}

function handleMessageBoardClick(e) {
    const target = e.target;
    const clickedCard = target.closest('.message');

    if (clickedCard) {
        const isInteractive = target.closest('.vote-area, .reply-form-container, .card-top-right, .read-more-container');
        const isAlreadyAnimating = clickedCard.classList.contains('poked') || clickedCard.classList.contains('poked-on-hover');

        if (!isInteractive && !isAlreadyAnimating) {
            const wasHovered = clickedCard.classList.contains('is-hovered');
            if (wasHovered) {
                clickedCard.classList.remove('is-hovered');
            }
            void clickedCard.offsetWidth;
            if (wasHovered) {
                clickedCard.classList.add('poked-on-hover');
                clickedCard.addEventListener('animationend', () => {
                    clickedCard.classList.remove('poked-on-hover');
                    if (clickedCard.matches(':hover')) {
                        clickedCard.classList.add('is-hovered');
                    }
                }, { once: true });
            } else {
                clickedCard.classList.add('poked');
                clickedCard.addEventListener('animationend', () => {
                    clickedCard.classList.remove('poked');
                }, { once: true });
            }
        }
    }

    if (target.classList.contains('vote-checkbox')) {
    if (target.checked) {
        const messageId = target.dataset.messageId;
        const voteType = target.dataset.voteType;
        handleVote(messageId, voteType).then(result => {
            if (result && result.success) {
                localStorage.setItem(`${LOCAL_STORAGE_KEYS.VOTED_PREFIX}${messageId}`, voteType);
                const card = document.querySelector(`.message[data-message-id="${messageId}"]`);
                if (card) {
                    const countElement = card.querySelector(`.${voteType}-text-content`);
                        if (countElement) {
                            const currentCount = parseInt(countElement.textContent, 10);
                            countElement.textContent = currentCount + 1;
                            countElement.classList.add('bump');
                            countElement.addEventListener('animationend', () => countElement.classList.remove('bump'), { once: true });
                        }
                    }
                    if (voteType === 'like') target.checked = true;
                    else target.checked = true;
                    showToast('投票成功！', 'success');
                }
            }).catch(error => {
                showToast('投票请求失败: ' + error.message, 'error');
                target.checked = false;
            }).finally(() => {
                target.disabled = false;
                const otherVoteType = target.dataset.voteType === 'like' ? 'dislike' : 'like';
                const otherCheckbox = document.getElementById(`${otherVoteType}-checkbox-${target.dataset.messageId}`);
                if(otherCheckbox) otherCheckbox.disabled = false;
            });
        }
        return;
    }

    if (target.classList.contains('report-checkbox')) {
        if (target.checked) {
            const messageId = target.dataset.messageId;
            target.disabled = true;
            handleReport(messageId).then(result => {
                if (result && result.success) {
                    localStorage.setItem(`${LOCAL_STORAGE_KEYS.REPORTED_PREFIX}${messageId}`, 'true');
                    const card = document.querySelector(`.message[data-message-id="${messageId}"]`);
                    if (card) {
                        const countElement = card.querySelector('.report-text-content');
                        const currentCount = parseInt(countElement.textContent, 10);
                        countElement.textContent = currentCount + 1;
                    }
                    showToast('感谢您的举报，我们将会尽快处理！', 'success');
                    target.checked = true;
                }
            }).catch(error => {
                showToast('举报请求失败: ' + error.message, 'error');
                target.disabled = false;
                target.checked = false;
            });
        }
        return;
    }

    if (target.classList.contains('delete-btn')) {
        e.stopPropagation();
        const messageId = target.dataset.messageId;
        if (confirm('您确定要永久删除这条消息吗？此操作不可撤销。')) {
            handleDelete(messageId).then(result => {
                if(result && result.success) {
                    showToast('消息已删除', 'success');
                    const messageElement = document.querySelector(`.message[data-message-id="${messageId}"]`);
                    if (messageElement) {
                        messageElement.style.transition = 'opacity 0.5s ease';
                        messageElement.style.opacity = '0';
                        setTimeout(() => {
                            messageElement.remove();
                        }, 500);
                    }
                }
            }).catch(error => {
                if (error instanceof AuthError) {
                    showToast(error.message, 'error');
                    sessionStorage.removeItem(LOCAL_STORAGE_KEYS.AUTH_TOKEN);
                    setAuthToken(null);
                    initializePage();
                } else {
                    showToast('删除请求失败: ' + error.message, 'error');
                }
            });
        }
        return;
    }

    if (target.classList.contains('submit-reply-btn')) {
        const messageId = target.dataset.messageId;
        const container = document.querySelector(`.message[data-message-id="${messageId}"]`);
        const textarea = container.querySelector('.reply-textarea');
        const replyContent = textarea.value.trim();

        if (!replyContent) {
            showToast('回复内容不能为空', 'error');
            return;
        }
        
        target.disabled = true;
        target.textContent = '提交中...';

        submitReply(messageId, replyContent).then(result => {
            if (result && result.success) {
                showToast('回复成功！', 'success');
                initializePage();
            }
        }).catch(error => {
            if (error instanceof AuthError) {
                showToast(error.message, 'error');
                sessionStorage.removeItem(LOCAL_STORAGE_KEYS.AUTH_TOKEN);
                setAuthToken(null);
                initializePage();
            } else {
                showToast('提交回复失败: ' + error.message, 'error');
            }
        }).finally(() => {
            target.disabled = false;
            target.textContent = '提交回复';
        });
        return;
    }

    if (target.classList.contains('read-more-trigger')) {
        const popup = target.nextElementSibling;
        if (popup && popup.classList.contains('full-content-popup')) {
            const isVisible = popup.classList.toggle('popup-visible');
            target.textContent = isVisible ? '收起' : '阅读全文';
            e.stopPropagation();
        }
        return;
    }
}

function handleMessageBoardMouseOver(e) {
    const card = e.target.closest('.message');
    if (card && !card.classList.contains('poked')) {
        card.classList.add('is-hovered');
    }
    
    const trigger = e.target.closest('.admin-reply-trigger');
    if (trigger) {
        handleAdminReplyHover(trigger);
    }
}

function handleMessageBoardMouseOut(e) {
    const card = e.target.closest('.message');
    if (card) {
        card.classList.remove('is-hovered');
    }

    const trigger = e.target.closest('.admin-reply-trigger');
    if (trigger) {
        const popup = trigger.querySelector('.admin-reply-popup');
        if (popup) {
            popup.classList.remove('popup-visible', 'popup-align-right');
        }
    }
}

function handleMessageBoardChange(e) {
    if (e.target.classList.contains('tag-select')) {
        const messageId = e.target.dataset.messageId;
        const newTag = e.target.value;
        handleSetTag(messageId, newTag).then(result => {
            if (result && result.success) {
                showToast('标签更新成功！', 'success');
            }
        }).catch(error => {
            if (error instanceof AuthError) {
                showToast(error.message, 'error');
                sessionStorage.removeItem(LOCAL_STORAGE_KEYS.AUTH_TOKEN);
                setAuthToken(null);
                initializePage();
            } else {
                showToast('设置标签失败: ' + error.message, 'error');
            }
        });
    }
}

function handleSearchInput(e) {
    const hasValue = searchInput.value.trim() !== '';
    clearSearchBtn.style.display = hasValue ? 'flex' : 'none';

    if (e.type === 'input') {
        if (hasValue) {
            debouncedSearch();
        } else {
            debouncedSearch.cancel();
            initializePage();
        }
    }
}

function handleClearSearch() {
    searchInput.value = '';
    clearSearchBtn.style.display = 'none';
    initializePage();
}

function handleLoginButtonClick() {
    if (getAuthToken()) {
        if (confirm('您确定要退出管理员登录吗？')) {
            sessionStorage.removeItem(LOCAL_STORAGE_KEYS.AUTH_TOKEN);
            setAuthToken(null);
            initializePage();
        }
    } else {
        loginModal.style.display = 'flex';
    }
}

async function handleLoginSubmit() {
    const password = passwordInput.value;
    if (!password) {
        loginError.textContent = '密码不能为空';
        return;
    }
    try {
        const result = await login(password);
        if (result.success && result.token) {
            sessionStorage.setItem(LOCAL_STORAGE_KEYS.AUTH_TOKEN, result.token);
            setAuthToken(result.token);
            loginModal.style.display = 'none';
            loginError.textContent = '';
            passwordInput.value = '';
            initializePage();
        } else {
            loginError.textContent = '密码错误';
        }
    } catch (error) {
        loginError.textContent = '登录请求失败';
    }
}

function handleAdminReplyHover(trigger) {
    const popup = trigger.querySelector('.admin-reply-popup');
    if (!popup) return;
    popup.classList.remove('popup-align-right');
    popup.classList.add('popup-visible');
    const rect = popup.getBoundingClientRect();
    if (rect.right > window.innerWidth) {
        popup.classList.add('popup-align-right');
    }
}

function setupCustomSelects() {
    document.querySelectorAll('.custom-select-wrapper').forEach(wrapper => {
        const selected = wrapper.querySelector('.select-selected');
        const items = wrapper.querySelector('.select-items');
        const options = items.querySelectorAll('div');

        selected.addEventListener('click', (e) => {
            e.stopPropagation();
            document.querySelectorAll('.select-items.select-show').forEach(openItems => {
                if (openItems !== items) {
                    openItems.classList.remove('select-show');
                    openItems.closest('.custom-select-wrapper').querySelector('.select-selected').classList.remove('select-arrow-active');
                }
            });
            items.classList.toggle('select-show');
            selected.classList.toggle('select-arrow-active');
        });

        options.forEach(option => {
            option.addEventListener('click', function() {
                const selectedSpan = selected.querySelector('span');
                selectedSpan.textContent = this.textContent;
                selectedSpan.dataset.value = this.dataset.value;
                items.classList.remove('select-show');
                selected.classList.remove('select-arrow-active');
                initializePage();
            });
        });
    });

    window.addEventListener('click', function() {
        document.querySelectorAll('.select-items.select-show').forEach(openItems => {
            openItems.classList.remove('select-show');
            openItems.closest('.custom-select-wrapper').querySelector('.select-selected').classList.remove('select-arrow-active');
        });
    });
}

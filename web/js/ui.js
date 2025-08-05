// UI 管家
// 所有跟页面元素打交道、更新画面的活儿都在这。
import { getAuthToken } from './api.js';
import { LOCAL_STORAGE_KEYS, UI } from './constants.js';

const messageBoard = document.getElementById('messageBoard');
const loader = document.getElementById('loader');
const loginBtn = document.getElementById('admin-login-btn');

export function showLoader() {
    loader.style.display = 'flex';
}

export function hideLoader() {
    loader.style.display = 'none';
}

export function clearMessageBoard() {
    messageBoard.innerHTML = '';
}

export function renderSkeleton(count = 5) {
    const fragment = document.createDocumentFragment();
    for (let i = 0; i < count; i++) {
        const skeletonCard = document.createElement('div');
        skeletonCard.classList.add('skeleton-card');
        skeletonCard.innerHTML = `
            <div class="skeleton-header">
                <div class="skeleton skeleton-avatar"></div>
                <div class="skeleton-info">
                    <div class="skeleton skeleton-line"></div>
                    <div class="skeleton skeleton-line skeleton-line-short"></div>
                </div>
            </div>
            <div class="skeleton-content">
                <div class="skeleton skeleton-line"></div>
                <div class="skeleton skeleton-line"></div>
                <div class="skeleton skeleton-line skeleton-line-short"></div>
            </div>
        `;
        fragment.appendChild(skeletonCard);
    }
    messageBoard.appendChild(fragment);
}

export function renderMessages(messages, currentPage) {
    if (!messages || messages.length === 0) {
        if (currentPage === 1) {
            messageBoard.innerHTML = `
                <div class="empty-state-card">
                    <svg class="empty-state-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-5h2v2h-2zm0-8h2v6h-2z" fill="currentColor"/>
                        <path d="M12.5 7.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zm-1 3h2v6h-2zm-1-8C6.48 2.5 2.5 6.48 2.5 11.5s4.48 9 9 9 9-4.48 9-9-4.48-9-9-9zm0 16c-3.86 0-7-3.14-7-7s3.14-7 7-7 7 3.14 7 7-3.14 7-7 7z" fill="currentColor" style="opacity:0.3;"/>
                        <path d="M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16zm-1 13h2v-2h-2v2zm0-4h2V7h-2v6z" fill="currentColor"/>
                    </svg>
                    <h2>这里什么都没有喵</h2>
                    <p>这里还没有任何反馈或建议喵，可以在群里发送 投信 xxx 反馈建议内容哦喵！</p>
                </div>
            `;
        }
        return;
    }

    const fragment = document.createDocumentFragment();
    const newItems = messages.map(msg => {
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = createMessageHTML(msg).trim();
        return tempDiv.firstChild;
    });

    newItems.forEach(item => fragment.appendChild(item));
    messageBoard.appendChild(fragment);

    setTimeout(() => {
        requestAnimationFrame(() => {
            resizeGridItems();
        });
    }, 100);

    const observer = new IntersectionObserver((entries, observer) => {
        entries.forEach((entry, index) => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
                observer.unobserve(entry.target);
            }
        });
    }, { threshold: 0.1 });

    newItems.forEach((item, index) => {
        item.style.setProperty('--stagger-delay', `${index * 50}ms`);
        observer.observe(item);
    });

    initializeVoteAndReportStatus();
    initializeImageLazyLoading();
}

function createMessageHTML(message) {
    const avatarUrl = `https://q1.qlogo.cn/g?b=qq&nk=${message.user_id}&s=640`;
    const isAdmin = !!getAuthToken();

    const replyFormHTML = isAdmin ? createReplyFormHTML(message.id) : '';
    const deleteButtonHTML = isAdmin ? `<button class="delete-btn" data-message-id="${message.id}">&times;</button>` : '';
    const tagHTML = createTagHTML(message, isAdmin);

    const adminReplyTriggerHTML = message.replies && message.replies.length > 0 ? `
       <div class="icons admin-reply-trigger">
           <label class="btn-label">
               <span class="reply-text-content">${message.replies.length}</span>
               <svg class="svgs" id="icon-reply" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"></path></svg>
               <div class="admin-reply-popup">
                   ${message.replies.map(createReplyHTML).join('')}
               </div>
           </label>
       </div>
    ` : '';

    const contentText = escapeHTML(message.content.trim());
    const needsTruncation = contentText.length > UI.TRUNCATE_LENGTH;
    let contentClasses = 'content';
    if (needsTruncation) {
        contentClasses += ' truncated';
    } else if (message.content.trim().length < 40 && !message.content.includes('\\n')) {
        contentClasses += ' content-center';
    }
    
    const readMoreHTML = needsTruncation ? `
        <div class="read-more-container">
            <span class="read-more-trigger">阅读全文</span>
            <div class="full-content-popup">
                ${contentText}
            </div>
        </div>
    ` : '';

    return `
        <div class="message" data-message-id="${message.id}">
            <div class="card-top-right">
                ${tagHTML}
                ${deleteButtonHTML}
            </div>
            <div class="message-info">
                <div class="info">
                    <img src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7" data-src="${avatarUrl}" alt="头像" class="lazy-avatar">
                    <strong title="QQ: ${escapeHTML(message.user_id)}">${escapeHTML(message.user_name)}</strong>
                </div>
                <span>发布于: ${new Date(message.timestamp).toLocaleString()}</span>
            </div>
            <div class="${contentClasses}">${contentText}</div>
            ${readMoreHTML}
            <div class="vote-area">
                <div class="icons-box">
                    <div class="icons">
                        <label class="btn-label" for="like-checkbox-${message.id}">
                            <span class="tooltip-text">要点赞吗喵？</span>
                            <span class="like-text-content">${message.likes || 0}</span>
                            <input class="input-box vote-checkbox" id="like-checkbox-${message.id}" type="checkbox" data-message-id="${message.id}" data-vote-type="like">
                            <svg class="svgs" id="icon-like-solid" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path d="M313.4 32.9c26 5.2 42.9 30.5 37.7 56.5l-2.3 11.4c-5.3 26.7-15.1 52.1-28.8 75.2H464c26.5 0 48 21.5 48 48c0 18.5-10.5 34.6-25.9 42.6C497 275.4 504 288.9 504 304c0 23.4-16.8 42.9-38.9 47.1c4.4 7.3 6.9 15.8 6.9 24.9c0 21.3-13.9 39.4-33.1 45.6c.7 3.3 1.1 6.8 1.1 10.4c0 26.5-21.5 48-48 48H294.5c-19 0-37.5-5.6-53.3-16.1l-38.5-25.7C176 420.4 160 390.4 160 358.3V320 272 247.1c0-29.2 13.3-56.7 36-75l7.4-5.9c26.5-21.2 44.6-51 51.2-84.2l2.3-11.4c5.2-26 30.5-42.9 56.5-37.7zM32 192H96c17.7 0 32 14.3 32 32V448c0 17.7-14.3 32-32 32H32c-17.7 0-32-14.3-32-32V224c0-17.7 14.3-32 32-32z"></path></svg>
                            <svg class="svgs" id="icon-like-regular" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path d="M323.8 34.8c-38.2-10.9-78.1 11.2-89 49.4l-5.7 20c-3.7 13-10.4 25-19.5 35l-51.3 56.4c-8.9 9.8-8.2 25 1.6 33.9s25 8.2 33.9-1.6l51.3-56.4c14.1-15.5 24.4-34 30.1-54.1l5.7-20c3.6-12.7 16.9-20.1 29.7-16.5s20.1 16.9 16.5 29.7l-5.7 20c-5.7 19.9-14.7 38.7-26.6 55.5c-5.2 7.3-5.8 16.9-1.7 24.9s12.3 13 21.3 13L448 224c8.8 0 16 7.2 16 16c0 6.8-4.3 12.7-10.4 15c-7.4 2.8-13 9-14.9 16.7s.1 15.8 5.3 21.7c2.5 2.8 4 6.5 4 10.6c0 7.8-5.6 14.3-13 15.7c-8.2 1.6-15.1 7.3-18 15.1s-1.6 16.7 3.6 23.3c2.1 2.7 3.4 6.1 3.4 9.9c0 6.7-4.2 12.6-10.2 14.9c-11.5 4.5-17.7 16.9-14.4 28.8c.4 1.3 .6 2.8 .6 4.3c0 8.8-7.2 16-16 16H286.5c-12.6 0-25-3.7-35.5-10.7l-61.7-41.1c-11-7.4-25.9-4.4-33.3 6.7s-4.4 25.9 6.7 33.3l61.7 41.1c18.4 12.3 40 18.8 62.1 18.8H384c34.7 0 62.9-27.6 64-62c14.6-11.7 24-29.7 24-50c0-4.5-.5-8.8-1.3-13c15.4-11.7 25.3-30.2 25.3-51c0-6.5-1-12.8-2.8-18.7C504.8 273.7 512 257.7 512 240c0-35.3-28.6-64-64-64l-92.3 0c4.7-10.4 8.7-21.2 11.8-32.2l5.7-20c10.9-38.2-11.2-78.1-49.4-89zM32 192c-17.7 0-32 14.3-32 32V448c0 17.7 14.3 32 32 32H96c17.7 0 32-14.3 32-32V224c0-17.7-14.3-32-32-32H32z"></path></svg>
                             <div class="fireworks"><div class="checked-like-fx"></div></div>
                         </label>
                    </div>
                   <div class="icons">
                        <label class="btn-label" for="dislike-checkbox-${message.id}">
                            <span class="tooltip-text">给他/她/它/祂点踩喵？</span>
                            <span class="dislike-text-content">${message.dislikes || 0}</span>
                            <input class="input-box vote-checkbox" id="dislike-checkbox-${message.id}" type="checkbox" data-message-id="${message.id}" data-vote-type="dislike">
                            <div class="fireworks"><div class="checked-dislike-fx"></div></div>
                            <svg class="svgs" id="icon-dislike-solid" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path d="M313.4 32.9c26 5.2 42.9 30.5 37.7 56.5l-2.3 11.4c-5.3 26.7-15.1 52.1-28.8 75.2H464c26.5 0 48 21.5 48 48c0 18.5-10.5 34.6-25.9 42.6C497 275.4 504 288.9 504 304c0 23.4-16.8 42.9-38.9 47.1c4.4 7.3 6.9 15.8 6.9 24.9c0 21.3-13.9 39.4-33.1 45.6c.7 3.3 1.1 6.8 1.1 10.4c0 26.5-21.5 48-48 48H294.5c-19 0-37.5-5.6-53.3-16.1l-38.5-25.7C176 420.4 160 390.4 160 358.3V320 272 247.1c0-29.2 13.3-56.7 36-75l7.4-5.9c26.5-21.2 44.6-51 51.2-84.2l2.3-11.4c5.2-26 30.5-42.9 56.5-37.7zM32 192H96c17.7 0 32 14.3 32 32V448c0 17.7-14.3 32-32 32H32c-17.7 0-32-14.3-32-32V224c0-17.7 14.3-32 32-32z"></path></svg>
                            <svg class="svgs" id="icon-dislike-regular" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path d="M323.8 34.8c-38.2-10.9-78.1 11.2-89 49.4l-5.7 20c-3.7 13-10.4 25-19.5 35l-51.3 56.4c-8.9 9.8-8.2 25 1.6 33.9s25 8.2 33.9-1.6l51.3-56.4c14.1-15.5 24.4-34 30.1-54.1l5.7-20c3.6-12.7 16.9-20.1 29.7-16.5s20.1 16.9 16.5 29.7l-5.7 20c-5.7 19.9-14.7 38.7-26.6 55.5c-5.2 7.3-5.8 16.9-1.7 24.9s12.3 13 21.3 13L448 224c8.8 0 16 7.2 16 16c0 6.8-4.3 12.7-10.4 15c-7.4 2.8-13 9-14.9 16.7s.1 15.8 5.3 21.7c2.5 2.8 4 6.5 4 10.6c0 7.8-5.6 14.3-13 15.7c-8.2 1.6-15.1 7.3-18 15.1s-1.6 16.7 3.6 23.3c2.1 2.7 3.4 6.1 3.4 9.9c0 6.7-4.2 12.6-10.2 14.9c-11.5 4.5-17.7 16.9-14.4 28.8c.4 1.3 .6 2.8 .6 4.3c0 8.8-7.2 16-16 16H286.5c-12.6 0-25-3.7-35.5-10.7l-61.7-41.1c-11-7.4-25.9-4.4-33.3 6.7s-4.4 25.9 6.7 33.3l61.7 41.1c18.4 12.3 40 18.8 62.1 18.8H384c34.7 0 62.9-27.6 64-62c14.6-11.7 24-29.7 24-50c0-4.5-.5-8.8-1.3-13c15.4-11.7 25.3-30.2 25.3-51c0-6.5-1-12.8-2.8-18.7C504.8 273.7 512 257.7 512 240c0-35.3-28.6-64-64-64l-92.3 0c4.7-10.4 8.7-21.2 11.8-32.2l5.7-20c10.9-38.2-11.2-78.1-49.4-89zM32 192c-17.7 0-32 14.3-32 32V448c0 17.7 14.3 32 32 32H96c17.7 0 32-14.3 32-32V224c0-17.7-14.3-32-32-32H32z"></path></svg>
                         </label>
                    </div>
                   <div class="icons">
                       <label class="btn-label" for="report-checkbox-${message.id}">
                           <span class="tooltip-text">举报了喵！</span>
                           <span class="report-text-content">${message.reports || 0}</span>
                           <input class="input-box report-checkbox" id="report-checkbox-${message.id}" type="checkbox" data-message-id="${message.id}">
                           <svg class="svgs" id="icon-report" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M4 2h16a1 1 0 0 1 .993.883L21 3v11.727a.5.5 0 0 1-.293.453L12 19.5l-8.707-4.32a.5.5 0 0 1-.293-.453V3a1 1 0 0 1 .883-.993L4 2zm15 2-7 3.5-7-3.5v9.9l7 3.45 7-3.45V4z"></path></svg>
                       </label>
                   </div>
                    ${adminReplyTriggerHTML}
            </div>
            <div class="reply-form-container">
                ${replyFormHTML}
            </div>
        </div>
    `;
}

function createReplyHTML(reply) {
    return `
        <div class="reply">
            <div class="reply-header">
                <strong>管理员回复:</strong>
                <span>${new Date(reply.timestamp).toLocaleString()}</span>
            </div>
            <div class="content">
                ${escapeHTML(reply.content)}
            </div>
        </div>
    `;
}

function createReplyFormHTML(messageId) {
    return `
        <textarea class="reply-textarea" placeholder="输入回复内容..."></textarea>
        <button class="submit-reply-btn" data-message-id="${messageId}">提交回复</button>
    `;
}

function createTagHTML(message, isAdmin) {
    const tags = {
        '已采纳': 'tag-accepted',
        '待考虑': 'tag-pending',
        '已拒绝': 'tag-rejected',
        '待处理': 'tag-default',
        '制作中': 'tag-in-progress',
        '已完成': 'tag-completed'
    };
    const currentTag = message.tag || '待处理';
    const tagClass = tags[currentTag] || 'tag-default';

    if (isAdmin) {
        return `
            <div class="tag-container">
                <select class="tag-select" data-message-id="${message.id}">
                    <option value="待处理" ${currentTag === '待处理' ? 'selected' : ''}>待处理</option>
                    <option value="制作中" ${currentTag === '制作中' ? 'selected' : ''}>制作中</option>
                    <option value="已完成" ${currentTag === '已完成' ? 'selected' : ''}>已完成</option>
                    <option value="已采纳" ${currentTag === '已采纳' ? 'selected' : ''}>已采纳</option>
                    <option value="待考虑" ${currentTag === '待考虑' ? 'selected' : ''}>待考虑</option>
                    <option value="已拒绝" ${currentTag === '已拒绝' ? 'selected' : ''}>已拒绝</option>
                </select>
            </div>
        `;
    } else {
        return `<div class="message-tag ${tagClass}">${escapeHTML(currentTag)}</div>`;
    }
}

function escapeHTML(str) {
    if (typeof str !== 'string') return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

export function resizeGridItems() {
    const grid = document.getElementById('messageBoard');
    if (!grid) return;

    const rowHeight = parseInt(window.getComputedStyle(grid).getPropertyValue('grid-auto-rows'));
    const rowGap = parseInt(window.getComputedStyle(grid).getPropertyValue('grid-row-gap'));

    document.querySelectorAll('.message:not(.resized)').forEach(item => {
        const contentHeight = item.scrollHeight;
        const rowSpan = Math.ceil((contentHeight + rowGap) / (rowHeight + rowGap));
        item.style.gridRowEnd = `span ${rowSpan}`;
        item.classList.add('resized');
    });
}

export function updateLoginButtonState() {
    if (getAuthToken()) {
        loginBtn.textContent = '管理员已登录';
        loginBtn.classList.add('admin-logged-in');
    } else {
        loginBtn.textContent = '管理员登录';
        loginBtn.classList.remove('admin-logged-in');
    }
}

export function initializeVoteAndReportStatus() {
    document.querySelectorAll('.message:not(.status-initialized)').forEach(card => {
        const messageId = card.dataset.messageId;
        const votedStatus = localStorage.getItem(`${LOCAL_STORAGE_KEYS.VOTED_PREFIX}${messageId}`);
        if (votedStatus) {
            const likeCheckbox = card.querySelector(`#like-checkbox-${messageId}`);
            const dislikeCheckbox = card.querySelector(`#dislike-checkbox-${messageId}`);
            if(likeCheckbox) likeCheckbox.disabled = true;
            if(dislikeCheckbox) dislikeCheckbox.disabled = true;
            if (votedStatus === 'like' && likeCheckbox) {
                likeCheckbox.checked = true;
            } else if (votedStatus === 'dislike' && dislikeCheckbox) {
                dislikeCheckbox.checked = true;
            }
        }

        const reportedStatus = localStorage.getItem(`${LOCAL_STORAGE_KEYS.REPORTED_PREFIX}${messageId}`);
        const reportCheckbox = card.querySelector(`#report-checkbox-${messageId}`);
        if (reportedStatus && reportCheckbox) {
            reportCheckbox.disabled = true;
            reportCheckbox.checked = true;
        }
        
        card.classList.add('status-initialized');
    });
}

export function initializeImageLazyLoading() {
    const lazyImages = document.querySelectorAll('img.lazy-avatar:not(.loaded)');

    if ('IntersectionObserver' in window) {
        let lazyImageObserver = new IntersectionObserver((entries, observer) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting) {
                    let lazyImage = entry.target;
                    lazyImage.src = lazyImage.dataset.src;
                    lazyImage.classList.add('loaded');
                    lazyImageObserver.unobserve(lazyImage);
                }
            });
        });

        lazyImages.forEach((lazyImage) => {
            lazyImageObserver.observe(lazyImage);
        });
    } else {
        lazyImages.forEach((lazyImage) => {
            lazyImage.src = lazyImage.dataset.src;
            lazyImage.classList.add('loaded');
        });
    }
}

export function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    let icon = 'ℹ️';
    if (type === 'success') icon = '✅';
    if (type === 'error') icon = '❌';

    toast.innerHTML = `<span class="toast-icon">${icon}</span> ${message}`;
    
    container.appendChild(toast);

    setTimeout(() => {
        toast.remove();
    }, UI.TOAST_DURATION);
}
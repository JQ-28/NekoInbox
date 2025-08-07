// 封装所有和后端 Worker 打交道的 fetch 请求。
// 这样一来，API 的逻辑都集中在这里，以后要改也方便。

import { showToast } from './ui.js';
import { API_ENDPOINTS, LOCAL_STORAGE_KEYS } from './constants.js';

const BASE_URL = API_ENDPOINTS.BASE_URL;
let authToken = sessionStorage.getItem(LOCAL_STORAGE_KEYS.AUTH_TOKEN);
let turnstileToken = null;

export function setAuthToken(token) {
    authToken = token;
}

export function getAuthToken() {
    return authToken;
}

export function setTurnstileToken(token) {
    turnstileToken = token;
}

export async function fetchMessages(page = 1, limit = 10, sortBy = 'likes', filterByTag = 'all', searchTerm = '') {
    let apiUrl = `${BASE_URL}${API_ENDPOINTS.MESSAGES}?page=${page}&limit=${limit}&sortBy=${sortBy}&filterByTag=${filterByTag}`;
    if (searchTerm) {
        apiUrl += `&search=${encodeURIComponent(searchTerm)}`;
    }
    const response = await fetch(apiUrl);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    return await response.json();
}

export async function fetchConfig() {
    const response = await fetch(`${BASE_URL}${API_ENDPOINTS.CONFIG}`);
    if (!response.ok) throw new Error('无法获取配置');
    return await response.json();
}

export async function login(password) {
    const response = await fetch(`${BASE_URL}${API_ENDPOINTS.LOGIN}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
    });
    return await response.json();
}

export async function handleVote(messageId, voteType) {
    if (localStorage.getItem(`${LOCAL_STORAGE_KEYS.VOTED_PREFIX}${messageId}`)) return;

    if (!turnstileToken) {
        showToast('人机验证无效，请刷新页面重试。', 'error');
        return null;
    }
    
    const response = await fetch(`${BASE_URL}${API_ENDPOINTS.VOTE}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            messageId,
            voteType,
            'cf-turnstile-response': turnstileToken,
        }),
    });

    if (!response.ok) throw new Error('投票失败');
    return await response.json();
}

export async function handleReport(messageId) {
    if (localStorage.getItem(`${LOCAL_STORAGE_KEYS.REPORTED_PREFIX}${messageId}`)) return;

    if (!turnstileToken) {
        showToast('人机验证无效，请刷新页面重试。', 'error');
        return null;
    }
    
    const response = await fetch(`${BASE_URL}${API_ENDPOINTS.REPORT}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            messageId,
            'cf-turnstile-response': turnstileToken,
        }),
    });

    if (!response.ok) throw new Error('举报失败');
    return await response.json();
}

export class AuthError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AuthError';
  }
}

export async function handleDelete(messageId) {
    if (!authToken) {
        throw new AuthError('认证信息已过期或无效，请重新登录');
    }

    const response = await fetch(`${BASE_URL}${API_ENDPOINTS.MESSAGES}`, {
        method: 'DELETE',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({ messageId }),
    });

    if (!response.ok) {
        if (response.status === 401) {
            throw new AuthError('认证已过期，请重新登录。');
        }
        throw new Error('删除失败');
    }
    return await response.json();
}

export async function handleSetTag(messageId, tag) {
    if (!authToken) {
        throw new AuthError('认证信息已过期或无效，请重新登录');
    }

    const response = await fetch(`${BASE_URL}${API_ENDPOINTS.TAG}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({ messageId, tag }),
    });

    if (!response.ok) {
        if (response.status === 401) {
            throw new AuthError('认证已过期，请重新登录。');
        }
        throw new Error('设置标签失败');
    }
    return await response.json();
}

export async function submitReply(messageId, replyContent) {
    if (!authToken) {
        throw new AuthError('认证信息已过期或无效，请重新登录');
    }

    const response = await fetch(`${BASE_URL}${API_ENDPOINTS.REPLY}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({ messageId, replyContent }),
    });

    if (!response.ok) {
        if (response.status === 401) {
            throw new AuthError('认证已过期，请重新登录。');
        }
        throw new Error('回复失败');
    }
    return await response.json();
}
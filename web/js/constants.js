// 全局常量配置
// 把魔法字符串和固定配置都扔这里，方便管理，改一处全处改。

// 本地存储相关的键名
export const LOCAL_STORAGE_KEYS = {
    THEME: 'theme', // 主题（'dark' 或 'light'）
    AUTH_TOKEN: 'authToken', // 管理员登录凭证
    VOTED_PREFIX: 'voted_', // 投票记录的前缀，后面跟 messageId
    REPORTED_PREFIX: 'reported_', // 举报记录的前缀，后面跟 messageId
};

// 后端 API 接口路径
export const API_ENDPOINTS = {
    MESSAGES: '/api/messages',
    CONFIG: '/api/config',
    LOGIN: '/api/login',
    VOTE: '/api/vote',
    REPORT: '/api/report',
    TAG: '/api/tag',
    REPLY: '/api/reply',
};

// 一些默认的查询参数
export const DEFAULTS = {
    MESSAGES_PER_PAGE: 10, // 每页加载多少条消息
    SORT_BY: 'likes', // 默认按点赞数排序
    FILTER_BY_TAG: 'all', // 默认不过滤标签
};

// UI 相关的魔法数字
export const UI = {
    TRUNCATE_LENGTH: 128, // 消息内容超过多少个字就折叠
    SCROLL_THRESHOLD: 200, // 滚动到离底部多远时，开始加载下一页
    TOAST_DURATION: 3000, // Toast 提示显示多久（毫秒）
};
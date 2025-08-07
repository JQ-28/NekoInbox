-- 删除已存在的表，方便重新初始化
DROP TABLE IF EXISTS replies;
DROP TABLE IF EXISTS messages;

-- 消息主表
CREATE TABLE messages (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    user_name TEXT NOT NULL,
    content TEXT NOT NULL,
    type TEXT NOT NULL, -- 'feedback', 'suggestion', 'message'
    tag TEXT NOT NULL DEFAULT '待处理',
    timestamp TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    likes INTEGER NOT NULL DEFAULT 0,
    dislikes INTEGER NOT NULL DEFAULT 0,
    reports INTEGER NOT NULL DEFAULT 0
);

-- 回复表
CREATE TABLE replies (
    id TEXT PRIMARY KEY,
    message_id TEXT NOT NULL,
    content TEXT NOT NULL,
    timestamp TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE -- 关键：删除主消息时，自动删除所有关联的回复
);

-- 为常用查询字段创建索引，极大提升查询性能
CREATE INDEX idx_messages_tag ON messages (tag);
CREATE INDEX idx_messages_timestamp ON messages (timestamp);
CREATE INDEX idx_messages_likes ON messages (likes);

-- 扩展数据库架构以支持多用户并发隔离机制
-- 文件: server/database/concurrent_isolation_schema.sql

-- 用户会话表 - 支持会话隔离和验证
CREATE TABLE IF NOT EXISTS user_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    session_id VARCHAR(255) UNIQUE NOT NULL,
    session_type VARCHAR(50) NOT NULL, -- 'learning', 'quiz', 'admin'
    tag_id INTEGER,
    current_stage INTEGER DEFAULT 1,
    learning_state TEXT, -- JSON格式存储学习状态
    last_activity DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (tag_id) REFERENCES tags(id),
    INDEX idx_user_session (user_id, session_id),
    INDEX idx_session_expiry (expires_at)
);

-- AI模型设置表 - 支持版本控制和管理员统一管理
CREATE TABLE IF NOT EXISTS ai_model_settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    version INTEGER NOT NULL UNIQUE,
    model_type VARCHAR(100) NOT NULL, -- 'deepseek', 'openai', etc.
    model_name VARCHAR(100) NOT NULL,
    api_endpoint VARCHAR(500),
    model_config TEXT, -- JSON格式存储模型配置
    is_active BOOLEAN DEFAULT FALSE,
    created_by INTEGER NOT NULL, -- 管理员ID
    reason TEXT, -- 更新原因
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES users(id),
    INDEX idx_ai_version (version),
    INDEX idx_ai_active (is_active)
);

-- AI设置变更日志表 - 记录所有AI设置变更历史
CREATE TABLE IF NOT EXISTS ai_settings_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    version_from INTEGER,
    version_to INTEGER NOT NULL,
    admin_id INTEGER NOT NULL,
    change_reason TEXT,
    settings_diff TEXT, -- JSON格式存储设置差异
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (version_from) REFERENCES ai_model_settings(version),
    FOREIGN KEY (version_to) REFERENCES ai_model_settings(version),
    FOREIGN KEY (admin_id) REFERENCES users(id),
    INDEX idx_history_timestamp (timestamp)
);

-- 文件引用计数表 - 支持文件安全删除和引用管理
CREATE TABLE IF NOT EXISTS file_references (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    file_id VARCHAR(255) NOT NULL,
    reference_type VARCHAR(50) NOT NULL, -- 'tag', 'learning', 'quiz', 'vector'
    reference_id VARCHAR(255) NOT NULL, -- 引用的对象ID
    user_id INTEGER, -- 用户相关的引用
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    UNIQUE(file_id, reference_type, reference_id),
    INDEX idx_file_refs (file_id),
    INDEX idx_ref_type (reference_type)
);

-- 文件锁定表 - 支持文件并发访问控制
CREATE TABLE IF NOT EXISTS file_locks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    file_id VARCHAR(255) NOT NULL UNIQUE,
    locked_by INTEGER NOT NULL,
    lock_type VARCHAR(50) NOT NULL, -- 'edit', 'delete', 'process'
    lock_reason TEXT,
    locked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME NOT NULL,
    FOREIGN KEY (locked_by) REFERENCES users(id),
    INDEX idx_file_lock (file_id),
    INDEX idx_lock_expiry (expires_at)
);

-- 用户学习会话详情表 - 存储详细的学习状态
CREATE TABLE IF NOT EXISTS learning_session_details (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id VARCHAR(255) NOT NULL,
    user_id INTEGER NOT NULL,
    tag_id INTEGER NOT NULL,
    stage_number INTEGER NOT NULL,
    stage_content TEXT, -- JSON格式存储阶段内容
    stage_progress REAL DEFAULT 0, -- 阶段进度 0-1
    interaction_data TEXT, -- JSON格式存储交互数据
    ai_settings_version INTEGER, -- 使用的AI设置版本
    started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME,
    FOREIGN KEY (session_id) REFERENCES user_sessions(session_id),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (tag_id) REFERENCES tags(id),
    FOREIGN KEY (ai_settings_version) REFERENCES ai_model_settings(version),
    UNIQUE(session_id, stage_number),
    INDEX idx_learning_session (session_id, stage_number),
    INDEX idx_user_learning (user_id, tag_id)
);

-- 测验会话详情表 - 存储测验状态和答题记录
CREATE TABLE IF NOT EXISTS quiz_session_details (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id VARCHAR(255) NOT NULL,
    user_id INTEGER NOT NULL,
    tag_id INTEGER NOT NULL,
    quiz_type VARCHAR(50) NOT NULL, -- 'stage', 'final', 'review'
    questions_data TEXT NOT NULL, -- JSON格式存储题目数据
    answers_data TEXT, -- JSON格式存储答题数据
    current_question INTEGER DEFAULT 0,
    total_questions INTEGER NOT NULL,
    score REAL DEFAULT 0,
    ai_settings_version INTEGER, -- 使用的AI设置版本
    started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME,
    FOREIGN KEY (session_id) REFERENCES user_sessions(session_id),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (tag_id) REFERENCES tags(id),
    FOREIGN KEY (ai_settings_version) REFERENCES ai_model_settings(version),
    INDEX idx_quiz_session (session_id),
    INDEX idx_user_quiz (user_id, tag_id)
);

-- 并发控制表 - 防止重复生成和处理
CREATE TABLE IF NOT EXISTS concurrency_controls (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    resource_type VARCHAR(50) NOT NULL, -- 'quiz_generation', 'content_analysis', etc.
    resource_id VARCHAR(255) NOT NULL, -- 资源标识符
    user_id INTEGER NOT NULL,
    operation VARCHAR(50) NOT NULL, -- 'generating', 'processing', 'analyzing'
    locked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME NOT NULL,
    metadata TEXT, -- JSON格式存储额外信息
    FOREIGN KEY (user_id) REFERENCES users(id),
    UNIQUE(resource_type, resource_id, operation),
    INDEX idx_concurrency_resource (resource_type, resource_id),
    INDEX idx_concurrency_expiry (expires_at)
);

-- 系统通知表 - 支持实时通知
CREATE TABLE IF NOT EXISTS system_notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    notification_type VARCHAR(50) NOT NULL, -- 'ai_update', 'session_expired', 'admin_message'
    target_type VARCHAR(50) NOT NULL, -- 'user', 'admin', 'all'
    target_id INTEGER, -- 目标用户ID，NULL表示所有用户
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    data TEXT, -- JSON格式存储附加数据
    read_by TEXT, -- JSON数组存储已读用户ID列表
    expires_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (target_id) REFERENCES users(id),
    INDEX idx_notification_target (target_type, target_id),
    INDEX idx_notification_type (notification_type)
);

-- 审计日志表 - 记录重要操作
CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(50),
    resource_id VARCHAR(255),
    details TEXT, -- JSON格式存储操作详情
    ip_address VARCHAR(45),
    user_agent TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    INDEX idx_audit_user (user_id),
    INDEX idx_audit_action (action),
    INDEX idx_audit_timestamp (timestamp)
);

-- 创建必要的触发器用于自动清理过期数据
-- 自动清理过期会话
CREATE TRIGGER IF NOT EXISTS cleanup_expired_sessions
    AFTER INSERT ON user_sessions
    BEGIN
        DELETE FROM user_sessions WHERE expires_at < datetime('now');
        DELETE FROM file_locks WHERE expires_at < datetime('now');
        DELETE FROM concurrency_controls WHERE expires_at < datetime('now');
    END;

-- 自动更新会话最后活动时间
CREATE TRIGGER IF NOT EXISTS update_session_activity
    AFTER UPDATE ON learning_session_details
    BEGIN
        UPDATE user_sessions 
        SET last_activity = datetime('now')
        WHERE session_id = NEW.session_id;
    END;

-- AI对话会话表 - 存储用户的对话会话
CREATE TABLE IF NOT EXISTS ai_conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id VARCHAR(255) UNIQUE NOT NULL,
    user_id INTEGER NOT NULL,
    title VARCHAR(255) NOT NULL, -- 对话标题，自动生成或用户设置
    knowledge_mode VARCHAR(20) NOT NULL DEFAULT 'all', -- 'tag', 'document', 'all'
    knowledge_source_id VARCHAR(255), -- 知识源ID（标签ID或文档ID）
    knowledge_source_name VARCHAR(255), -- 知识源名称，便于显示
    ai_model VARCHAR(50) NOT NULL DEFAULT 'local', -- 使用的AI模型
    message_count INTEGER DEFAULT 0, -- 消息数量
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME NOT NULL, -- 24小时后过期
    FOREIGN KEY (user_id) REFERENCES users(id),
    INDEX idx_conversation_user (user_id),
    INDEX idx_conversation_session (session_id),
    INDEX idx_conversation_expiry (expires_at)
);

-- AI对话消息表 - 存储对话中的具体消息
CREATE TABLE IF NOT EXISTS ai_conversation_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER NOT NULL,
    message_id VARCHAR(255) UNIQUE NOT NULL,
    message_type VARCHAR(20) NOT NULL, -- 'user', 'assistant'
    content TEXT NOT NULL,
    context_data TEXT, -- JSON格式存储上下文信息
    ai_model VARCHAR(50), -- 生成回答时使用的模型
    tokens_used INTEGER DEFAULT 0, -- 使用的token数量（如果支持）
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (conversation_id) REFERENCES ai_conversations(id) ON DELETE CASCADE,
    INDEX idx_message_conversation (conversation_id),
    INDEX idx_message_timestamp (created_at)
);

-- 创建自动清理过期对话的触发器
CREATE TRIGGER IF NOT EXISTS cleanup_expired_conversations
    AFTER INSERT ON ai_conversations
    BEGIN
        -- 删除过期的对话及其消息
        DELETE FROM ai_conversations WHERE expires_at < datetime('now');
    END;

-- 自动更新对话的updated_at和message_count
CREATE TRIGGER IF NOT EXISTS update_conversation_on_message
    AFTER INSERT ON ai_conversation_messages
    BEGIN
        UPDATE ai_conversations 
        SET updated_at = datetime('now'),
            message_count = message_count + 1
        WHERE id = NEW.conversation_id;
    END;

-- 插入默认的AI模型设置
INSERT OR IGNORE INTO ai_model_settings (version, model_type, model_name, api_endpoint, is_active, created_by, reason) 
VALUES (1, 'deepseek', 'deepseek-chat', 'https://api.deepseek.com', 1, 1, '系统初始化默认设置');

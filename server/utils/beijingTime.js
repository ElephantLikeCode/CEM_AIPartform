/**
 * 北京时间工具类
 * 统一处理系统中的时间显示和存储
 */

class BeijingTimeUtil {
  constructor() {
    // 北京时间是UTC+8
    this.BEIJING_OFFSET = 8 * 60 * 60 * 1000; // 8小时的毫秒数
  }

  /**
   * 获取当前北京时间
   * @returns {Date} 北京时间Date对象
   */
  now() {
    const utc = new Date();
    return new Date(utc.getTime() + this.BEIJING_OFFSET);
  }

  /**
   * 获取北京时间的ISO字符串（替代toISOString）
   * @param {Date} date - 可选，指定日期，默认为当前时间
   * @returns {string} 北京时间的ISO格式字符串
   */
  toBeijingISOString(date = null) {
    const beijingTime = date ? new Date(date.getTime() + this.BEIJING_OFFSET) : this.now();
    return beijingTime.toISOString().replace('Z', '+08:00');
  }

  /**
   * 获取北京时间的本地化字符串
   * @param {Date} date - 可选，指定日期，默认为当前时间
   * @param {Object} options - 格式化选项
   * @returns {string} 格式化的北京时间字符串
   */
  toBeijingLocaleString(date = null, options = {}) {
    const beijingTime = date ? new Date(date.getTime() + this.BEIJING_OFFSET) : this.now();
    
    const defaultOptions = {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    };
    
    return beijingTime.toLocaleString('zh-CN', { ...defaultOptions, ...options });
  }

  /**
   * 格式化北京时间为 YYYY-MM-DD HH:mm:ss 格式
   * @param {Date|string} date - 可选，指定日期，默认为当前时间
   * @returns {string} 格式化的时间字符串
   */
  format(date = null) {
    let beijingTime;
    
    if (date === null || date === undefined) {
      beijingTime = this.now();
    } else if (date instanceof Date) {
      beijingTime = new Date(date.getTime() + this.BEIJING_OFFSET);
    } else if (typeof date === 'string' || typeof date === 'number') {
      // 处理字符串或时间戳输入
      const parsedDate = new Date(date);
      if (isNaN(parsedDate.getTime())) {
        console.warn('Invalid date provided to beijingTime.format:', date);
        beijingTime = this.now(); // 使用当前时间作为兜底
      } else {
        beijingTime = new Date(parsedDate.getTime() + this.BEIJING_OFFSET);
      }
    } else {
      console.warn('Unsupported date type provided to beijingTime.format:', typeof date, date);
      beijingTime = this.now(); // 使用当前时间作为兜底
    }
    
    const year = beijingTime.getFullYear();
    const month = String(beijingTime.getMonth() + 1).padStart(2, '0');
    const day = String(beijingTime.getDate()).padStart(2, '0');
    const hours = String(beijingTime.getHours()).padStart(2, '0');
    const minutes = String(beijingTime.getMinutes()).padStart(2, '0');
    const seconds = String(beijingTime.getSeconds()).padStart(2, '0');
    
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  }

  /**
   * 格式化北京时间为简短格式 MM-DD HH:mm
   * @param {Date} date - 可选，指定日期，默认为当前时间
   * @returns {string} 简短格式的时间字符串
   */
  formatShort(date = null) {
    const beijingTime = date ? new Date(date.getTime() + this.BEIJING_OFFSET) : this.now();
    
    const month = String(beijingTime.getMonth() + 1).padStart(2, '0');
    const day = String(beijingTime.getDate()).padStart(2, '0');
    const hours = String(beijingTime.getHours()).padStart(2, '0');
    const minutes = String(beijingTime.getMinutes()).padStart(2, '0');
    
    return `${month}-${day} ${hours}:${minutes}`;
  }

  /**
   * 将日期转换为北京时间戳（毫秒）
   * @param {Date|string|number} date - 日期输入
   * @returns {number} 北京时间戳（毫秒）
   */
  toBeijingTimestamp(date = null) {
    if (date === null || date === undefined) {
      return this.now().getTime();
    } else if (date instanceof Date) {
      return date.getTime() + this.BEIJING_OFFSET;
    } else if (typeof date === 'string' || typeof date === 'number') {
      const parsedDate = new Date(date);
      if (isNaN(parsedDate.getTime())) {
        console.warn('Invalid date provided to beijingTime.toBeijingTimestamp:', date);
        return this.now().getTime(); // 使用当前时间作为兜底
      } else {
        return parsedDate.getTime() + this.BEIJING_OFFSET;
      }
    } else {
      console.warn('Unsupported date type provided to beijingTime.toBeijingTimestamp:', typeof date, date);
      return this.now().getTime(); // 使用当前时间作为兜底
    }
  }

  /**
   * 将UTC时间字符串转换为北京时间显示
   * @param {string} utcString - UTC时间字符串
   * @returns {string} 北京时间格式字符串
   */
  utcToBeijing(utcString) {
    if (!utcString) return '';
    
    try {
      const utcDate = new Date(utcString);
      if (isNaN(utcDate.getTime())) return utcString; // 如果解析失败，返回原字符串
      
      return this.format(utcDate);
    } catch (error) {
      console.warn('时间转换失败:', error);
      return utcString;
    }
  }

  /**
   * 获取相对时间描述（几分钟前、几小时前等）
   * @param {Date|string} time - 时间对象或字符串
   * @returns {string} 相对时间描述
   */
  getRelativeTime(time) {
    try {
      const targetTime = typeof time === 'string' ? new Date(time) : time;
      if (isNaN(targetTime.getTime())) return '时间格式错误';
      
      const now = this.now();
      const diffMs = now.getTime() - targetTime.getTime();
      const diffSeconds = Math.floor(diffMs / 1000);
      const diffMinutes = Math.floor(diffSeconds / 60);
      const diffHours = Math.floor(diffMinutes / 60);
      const diffDays = Math.floor(diffHours / 24);
      
      if (diffSeconds < 60) {
        return '刚刚';
      } else if (diffMinutes < 60) {
        return `${diffMinutes}分钟前`;
      } else if (diffHours < 24) {
        return `${diffHours}小时前`;
      } else if (diffDays < 7) {
        return `${diffDays}天前`;
      } else {
        return this.format(targetTime);
      }
    } catch (error) {
      console.warn('相对时间计算失败:', error);
      return '时间计算错误';
    }
  }

  /**
   * 检查时间是否为今天（北京时间）
   * @param {Date|string} time - 时间对象或字符串
   * @returns {boolean} 是否为今天
   */
  isToday(time) {
    try {
      const targetTime = typeof time === 'string' ? new Date(time) : time;
      if (isNaN(targetTime.getTime())) return false;
      
      const today = this.now();
      const targetBeijing = new Date(targetTime.getTime() + this.BEIJING_OFFSET);
      
      return today.getDate() === targetBeijing.getDate() &&
             today.getMonth() === targetBeijing.getMonth() &&
             today.getFullYear() === targetBeijing.getFullYear();
    } catch (error) {
      return false;
    }
  }

  /**
   * 格式化为中文显示格式
   * @param {Date|string|number} date - 日期输入
   * @returns {string} 中文格式的时间字符串，如：2024年01月15日 14:30:25
   */
  formatToChinese(date = null) {
    let beijingTime;
    
    if (date === null || date === undefined) {
      beijingTime = this.now();
    } else if (date instanceof Date) {
      beijingTime = new Date(date.getTime() + this.BEIJING_OFFSET);
    } else if (typeof date === 'string' || typeof date === 'number') {
      const parsedDate = new Date(date);
      if (isNaN(parsedDate.getTime())) {
        console.warn('Invalid date provided to beijingTime.formatToChinese:', date);
        beijingTime = this.now(); // 使用当前时间作为兜底
      } else {
        beijingTime = new Date(parsedDate.getTime() + this.BEIJING_OFFSET);
      }
    } else {
      console.warn('Unsupported date type provided to beijingTime.formatToChinese:', typeof date, date);
      beijingTime = this.now(); // 使用当前时间作为兜底
    }
    
    const year = beijingTime.getFullYear();
    const month = String(beijingTime.getMonth() + 1).padStart(2, '0');
    const day = String(beijingTime.getDate()).padStart(2, '0');
    const hours = String(beijingTime.getHours()).padStart(2, '0');
    const minutes = String(beijingTime.getMinutes()).padStart(2, '0');
    const seconds = String(beijingTime.getSeconds()).padStart(2, '0');
    
    return `${year}年${month}月${day}日 ${hours}:${minutes}:${seconds}`;
  }

  /**
   * 获取今天开始时间（北京时间00:00:00）
   * @returns {Date} 今天开始时间
   */
  getTodayStart() {
    const now = this.now();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }

  /**
   * 获取今天结束时间（北京时间23:59:59）
   * @returns {Date} 今天结束时间
   */
  getTodayEnd() {
    const now = this.now();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  }
}

// 导出单例实例
const beijingTime = new BeijingTimeUtil();

module.exports = beijingTime;

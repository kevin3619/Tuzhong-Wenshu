import type React from 'react'

/**
 * textarea 自适应高度事件处理器。
 * 供 wizard-steps 各 Step 组件共享（此前为 14 份重复拷贝，2026-09 审计后收敛）。
 * 用法：<textarea onChange={autoResize} ... />
 */
export function autoResize(e: React.FormEvent<HTMLTextAreaElement>) {
  const ta = e.currentTarget
  ta.style.height = 'auto'
  ta.style.height = ta.scrollHeight + 'px'
}

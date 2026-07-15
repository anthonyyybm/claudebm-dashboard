import ReactMarkdown from 'react-markdown'
import remarkBreaks from 'remark-breaks'

export default function MarkdownText({ children, className = '' }) {
  if (!children) return null
  return (
    <div className={`md-content${className ? ` ${className}` : ''}`}>
      <ReactMarkdown remarkPlugins={[remarkBreaks]}>{children}</ReactMarkdown>
    </div>
  )
}

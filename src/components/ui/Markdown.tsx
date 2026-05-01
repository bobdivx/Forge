import { useMemo } from 'preact/hooks';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

interface Props {
  content: string;
  className?: string;
}

export default function Markdown({ content, className = '' }: Props) {
  const html = useMemo(() => {
    const rawHtml = marked.parse(content || '') as string;
    return typeof window !== 'undefined' ? DOMPurify.sanitize(rawHtml) : rawHtml;
  }, [content]);

  return (
    <div 
      className={`prose prose-sm max-w-none break-words ${className}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

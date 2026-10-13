import { lazy, Suspense, useState, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Check, Copy } from 'lucide-react';
import LazyBoundary from './LazyBoundary';
const Highlight = lazy(() => import('./Highlight'));
function CodeBlock({children,className}:{children?:ReactNode;className?:string}) {
  const [copied,setCopied] = useState(false); const [failed,setFailed] = useState(false);
  const language = className?.replace('language-','') || 'text'; const text = String(children || '').replace(/\n$/,'');
  return <div className="code-block"><div className="code-head"><span>{language}</span><button onClick={async () => { try { await navigator.clipboard.writeText(text); setCopied(true); setFailed(false); setTimeout(()=>setCopied(false),2000); } catch { setFailed(true); } }}>{copied ? <Check size={13}/> : <Copy size={13}/>} {failed ? 'Copy unavailable' : copied ? 'Copied' : 'Copy code'}</button></div><pre><LazyBoundary fallback={<code>{text}</code>}><Suspense fallback={<code>{text}</code>}><Highlight text={text} language={language}/></Suspense></LazyBoundary></pre></div>;
}
export default function Markdown({text}:{text:string}) {
  return <div className="markdown"><ReactMarkdown remarkPlugins={[remarkGfm]} components={{
    pre:({children}) => <>{children}</>,
    code:({children,className,node}) => className || node?.position?.start.line !== node?.position?.end.line ? <CodeBlock className={className}>{children}</CodeBlock> : <code className="inline-code">{children}</code>,
    a:({children,href}) => <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>,
    img:({alt}) => <span className="remote-image">[External image: {alt || 'image'}]</span>,
    table:({children}) => <div className="table-scroll"><table>{children}</table></div>,
  }}>{text}</ReactMarkdown></div>;
}

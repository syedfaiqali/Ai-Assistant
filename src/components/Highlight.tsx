import { useEffect, useState } from 'react';
import hljs from 'highlight.js/lib/core';
import javascript from 'highlight.js/lib/languages/javascript';
import typescript from 'highlight.js/lib/languages/typescript';
import python from 'highlight.js/lib/languages/python';
import json from 'highlight.js/lib/languages/json';
import bash from 'highlight.js/lib/languages/bash';
import css from 'highlight.js/lib/languages/css';
import xml from 'highlight.js/lib/languages/xml';
hljs.registerLanguage('javascript',javascript); hljs.registerLanguage('typescript',typescript); hljs.registerLanguage('python',python); hljs.registerLanguage('json',json); hljs.registerLanguage('bash',bash); hljs.registerLanguage('css',css); hljs.registerLanguage('xml',xml);
export default function Highlight({text,language}:{text:string;language:string}) {
  const [html,setHTML] = useState<string|null>(null);
  useEffect(() => { if (hljs.getLanguage(language) && text.length < 30000) setHTML(hljs.highlight(text,{language,ignoreIllegals:true}).value); else setHTML(null); },[text,language]);
  return html ? <code className="hljs" dangerouslySetInnerHTML={{__html:html}}/> : <code>{text}</code>;
}

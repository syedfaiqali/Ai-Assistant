import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';
import './Select.css';

export interface SelectOption { value:string; label:string; disabled?:boolean; }
interface Props {
  label:string;
  value:string;
  options:readonly SelectOption[];
  onChange:(value:string)=>void;
  disabled?:boolean;
  placeholder?:string;
  variant?:'field'|'inline';
}
export default function Select({label,value,options,onChange,disabled=false,placeholder='Select an option',variant='field'}:Props) {
  const id=useId();const trigger=useRef<HTMLButtonElement>(null);const menu=useRef<HTMLDivElement>(null);
  const [open,setOpen]=useState(false);const [active,setActive]=useState(-1);
  const [position,setPosition]=useState<{top:number;left:number;width:number;maxHeight:number}|null>(null);
  const search=useRef({text:'',at:0});
  const selected=options.find(option=>option.value===value);
  const expanded=open&&!disabled;
  function choose(index:number) {
    const option=options[index];if(!option||option.disabled)return;
    onChange(option.value);setOpen(false);trigger.current?.focus();
  }
  function reveal(last=false) {
    if(disabled||!options.some(option=>!option.disabled))return;
    trigger.current?.focus();
    const index=options.findIndex(option=>option.value===value&&!option.disabled);
    setActive(index>=0?index:last?options.reduce((found,option,index)=>option.disabled?found:index,-1):options.findIndex(option=>!option.disabled));setPosition(null);setOpen(true);
  }
  function move(direction:number) {
    let index=active;
    for(let count=0;count<options.length;count++){
      index=(index+direction+options.length)%options.length;
      if(!options[index].disabled){setActive(index);return;}
    }
  }
  function onKeyDown(event:KeyboardEvent<HTMLButtonElement>) {
    if(event.key==='Escape'&&expanded){event.preventDefault();event.stopPropagation();setOpen(false);return;}
    if(event.key==='Tab'){setOpen(false);return;}
    if(['ArrowDown','ArrowUp','Home','End','Enter',' '].includes(event.key)){
      event.preventDefault();
      if(!expanded){reveal(event.key==='ArrowUp'||event.key==='End');return;}
      if(event.key==='ArrowDown')move(1);
      else if(event.key==='ArrowUp')move(-1);
      else if(event.key==='Home')setActive(options.findIndex(option=>!option.disabled));
      else if(event.key==='End')setActive(options.reduce((found,option,index)=>option.disabled?found:index,-1));
      else choose(active);
      return;
    }
    if(event.key.length===1&&!event.ctrlKey&&!event.metaKey&&!event.altKey){
      event.preventDefault();const now=Date.now();search.current={text:now-search.current.at<650?search.current.text+event.key:event.key,at:now};
      const text=search.current.text.toLocaleLowerCase();const index=options.findIndex(option=>!option.disabled&&option.label.toLocaleLowerCase().startsWith(text));
      if(index>=0){if(expanded)setActive(index);else choose(index);}
    }
  }
  useEffect(()=>{if(disabled)setOpen(false);},[disabled]);
  useLayoutEffect(()=>{
    if(!expanded)return;
    function place(){
      if(!trigger.current)return;
      const rect=trigger.current.getBoundingClientRect();const gap=6;const inset=12;
      const width=Math.min(Math.max(rect.width,260),window.innerWidth-inset*2);
      const below=window.innerHeight-rect.bottom-gap-inset;const above=rect.top-gap-inset;
      const up=below<Math.min(240,options.length*40+12)&&above>below;
      const maxHeight=Math.max(40,Math.min(280,up?above:below));
      const height=Math.min(menu.current?.scrollHeight||280,maxHeight);
      setPosition({top:up?rect.top-gap-height:rect.bottom+gap,left:Math.max(inset,Math.min(rect.left,window.innerWidth-width-inset)),width,maxHeight});
    }
    place();window.addEventListener('resize',place);window.addEventListener('scroll',place,true);
    return()=>{window.removeEventListener('resize',place);window.removeEventListener('scroll',place,true);};
  },[expanded,options]);
  useEffect(()=>{
    if(!expanded)return;
    const outside=(event:Event)=>{const target=event.target as Node;if(!trigger.current?.contains(target)&&!menu.current?.contains(target))setOpen(false);};
    document.addEventListener('pointerdown',outside,true);document.addEventListener('click',outside,true);document.addEventListener('focusin',outside);
    return()=>{document.removeEventListener('pointerdown',outside,true);document.removeEventListener('click',outside,true);document.removeEventListener('focusin',outside);};
  },[expanded]);
  useEffect(()=>{if(expanded&&active>=0)menu.current?.querySelectorAll<HTMLElement>('[role="option"]')[active]?.scrollIntoView({block:'nearest'});},[active,expanded]);
  const host=trigger.current?.closest('dialog')||document.body;
  return <span className={`select-root select-root--${variant}`}>
    <button ref={trigger} type="button" className="select-trigger" role="combobox" aria-label={label} aria-expanded={expanded} aria-haspopup="listbox" aria-controls={expanded?`${id}-list`:undefined} aria-activedescendant={expanded&&active>=0?`${id}-${active}`:undefined} disabled={disabled||!options.length} onKeyDown={onKeyDown} onClick={()=>expanded?setOpen(false):reveal()}>
      <span className={`select-value${selected?'':' select-placeholder'}`}>{selected?.label||placeholder}</span><ChevronDown size={14} className="select-chevron"/>
    </button>
    {expanded&&createPortal(<div ref={menu} id={`${id}-list`} className="select-menu" role="listbox" aria-label={label} style={{...position,visibility:position?'visible':'hidden'}}>
      {options.map((option,index)=><div key={option.value} id={`${id}-${index}`} role="option" aria-selected={option.value===value} aria-disabled={option.disabled||undefined} className={`select-option${index===active?' is-active':''}${option.value===value?' is-selected':''}`} onPointerMove={()=>{if(!option.disabled)setActive(index);}} onMouseDown={event=>event.preventDefault()} onClick={event=>{event.preventDefault();event.stopPropagation();choose(index);}}>
        <span>{option.label}</span>{option.value===value&&<Check size={15} aria-hidden="true"/>}
      </div>)}
    </div>,host)}
  </span>;
}

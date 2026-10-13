import type { Character } from '../../shared/types';
export default function CharacterAvatar({character,large=false}:{character:Pick<Character,'name'|'avatar'>;large?:boolean}) {
  const initials = character.name.trim().split(/\s+/).slice(0,2).map(word=>Array.from(word)[0] || '').join('').toUpperCase();
  return <span className={`character-avatar ${large ? 'large' : ''}`} aria-hidden="true">{character.avatar ? <img src={character.avatar} alt=""/> : initials || '✧'}</span>;
}

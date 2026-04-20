import { useState, useEffect } from 'preact/hooks';
import type { AgentTeamProfile } from '../../lib/agent-profile';

type Size = 'xs' | 'sm' | 'md' | 'lg';

export default function TeamAvatar(props: { profile: AgentTeamProfile; size: Size; class?: string }) {
  const [imgBroken, setImgBroken] = useState(false);
  useEffect(() => {
    setImgBroken(false);
  }, [props.profile.avatarUrl, props.profile.avatarEmoji, props.profile.displayName]);

  const sizeCls =
    props.size === 'lg'
      ? 'h-14 w-14 text-base'
      : props.size === 'md'
        ? 'h-12 w-12 text-sm'
        : props.size === 'xs'
          ? 'h-8 w-8 text-[10px]'
          : 'h-9 w-9 text-[10px]';
  const box = `${sizeCls} flex shrink-0 items-center justify-center overflow-hidden rounded-full font-bold ${props.class ?? ''}`;
  const url = props.profile.avatarUrl?.trim();
  if (url && /^https:\/\//i.test(url) && !imgBroken) {
    return (
      <img
        src={url}
        alt=""
        class={`${box} object-cover ring-1 ring-gray-200`}
        loading="lazy"
        onError={() => setImgBroken(true)}
      />
    );
  }
  if (props.profile.avatarEmoji) {
    return <div class={`${box} bg-gray-50 text-lg ring-1 ring-gray-200`}>{props.profile.avatarEmoji}</div>;
  }
  return <div class={`${box} ring-1 ring-white ${props.profile.avatarClass}`}>{props.profile.initials}</div>;
}

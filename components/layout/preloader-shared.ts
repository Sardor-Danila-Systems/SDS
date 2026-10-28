/*
  Shared by the preloader (a client component) and the layout (a server
  component), so it lives outside the "use client" file: a server component
  can't read plain values exported from one.
*/

export const PRELOADER_KEY = "sds-preloader";
export const PRELOADER_EVENT = "sds:preloader-done";

/**
 * Runs before first paint: should the opening be skipped on this load?
 * Adding `?intro` to the address plays it again within the same session.
 */
export const PRELOADER_GUARD = `try{var p=location.pathname.replace(/^\\/(en|uz|ru)(?=\\/|$)/,'')||'/';if(p!=='/'||(sessionStorage.getItem('${PRELOADER_KEY}')&&location.search.indexOf('intro')<0)||window.matchMedia('(prefers-reduced-motion: reduce)').matches)document.documentElement.classList.add('sds-no-preloader')}catch(e){document.documentElement.classList.add('sds-no-preloader')}`;

import React, { useState, useEffect, useRef } from 'react';

const APP_URL = window.location.origin;
const INVITE_TEXT = 'Join me on myWorld — the Sui-native social network for athletes & creators. Connect, share, and own your content on-chain!';

export default function InviteModal({ onClose }) {
  const [copied, setCopied] = useState(false);
  const overlayRef = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (e.target === overlayRef.current) onClose(); };
    const keyHandler = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', handler);
    document.addEventListener('keydown', keyHandler);
    return () => { document.removeEventListener('mousedown', handler); document.removeEventListener('keydown', keyHandler); };
  }, [onClose]);

  const copyLink = async () => {
    try { await navigator.clipboard.writeText(APP_URL); } catch { }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const shareNative = async () => {
    if (navigator.share) {
      try { await navigator.share({ title: 'myWorld', text: INVITE_TEXT, url: APP_URL }); } catch { }
    }
  };

  return (
    <div ref={overlayRef}
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4"
      style={{ animation: 'fadeIn 0.15s ease' }}>
      <div className="relative w-full max-w-md bg-card border border-white/10 rounded-3xl shadow-2xl overflow-hidden animate-slide-up">
        {/* Accent bar */}
        <div className="h-1 w-full bg-gradient-to-r from-primary via-purple-500 to-amber-400" />

        <div className="p-6 flex flex-col gap-5">
          {/* Header */}
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold">Invite Friends 🌍</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Share myWorld and grow your network on the Sui blockchain.
              </p>
            </div>
            <button onClick={onClose}
              className="p-2 rounded-full hover:bg-white/10 transition-colors text-muted-foreground flex-shrink-0 -mt-1 -mr-1">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
            </button>
          </div>

          {/* Invite message preview */}
          <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
            <p className="text-sm text-foreground/90 leading-relaxed italic">
              "{INVITE_TEXT}"
            </p>
          </div>

          {/* Link box */}
          <div className="flex items-center gap-2 bg-secondary/60 border border-white/10 rounded-2xl px-4 py-3">
            <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-primary flex-shrink-0">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
            </svg>
            <span className="flex-1 text-sm font-mono text-muted-foreground truncate">{APP_URL}</span>
            <button onClick={copyLink}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex-shrink-0
                ${copied ? 'bg-green-500/20 text-green-400' : 'bg-primary/20 text-primary hover:bg-primary/30'}`}>
              {copied
                ? <><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Copied!</>
                : <><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg> Copy</>
              }
            </button>
          </div>

          {/* Share buttons */}
          <div className="flex flex-col gap-2">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Share via</p>
            <div className="grid grid-cols-2 gap-2">
              <a href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(INVITE_TEXT)}&url=${encodeURIComponent(APP_URL)}`}
                target="_blank" rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 px-4 py-3 bg-black/40 border border-white/10 rounded-2xl text-sm font-semibold hover:bg-white/10 transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.258 5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                Share on X
              </a>
              <a href={`https://wa.me/?text=${encodeURIComponent(INVITE_TEXT + ' ' + APP_URL)}`}
                target="_blank" rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 px-4 py-3 bg-green-500/10 border border-green-500/20 rounded-2xl text-sm font-semibold text-green-400 hover:bg-green-500/20 transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                WhatsApp
              </a>
              {navigator.share && (
                <button onClick={shareNative}
                  className="col-span-2 flex items-center justify-center gap-2 px-4 py-3 bg-primary/10 border border-primary/20 rounded-2xl text-sm font-semibold text-primary hover:bg-primary/20 transition-colors">
                  <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" x2="15.42" y1="13.51" y2="17.49"/><line x1="15.41" x2="8.59" y1="6.51" y2="10.49"/></svg>
                  More ways to share…
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

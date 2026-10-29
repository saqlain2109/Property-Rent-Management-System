import { useEffect, useRef } from 'react';

/**
 * Hook that enables the browser Back button to dismiss an active modal or sub-screen
 * returning the user to the active screen within the software, rather than navigating away or logging out.
 *
 * @param {boolean} isOpen Whether the modal/sub-screen is currently open
 * @param {Function} onClose Callback to close the modal/sub-screen
 */
export function useModalBackHandler(isOpen, onClose) {
  const isBackTriggeredRef = useRef(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!isOpen) return;

    const modalKey = `modal_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const currentHash = window.location.hash || '#/dashboard';
    const modalState = { modalOpen: true, modalKey };

    // Push the modal state into browser history so Back button pops this entry first
    window.history.pushState(modalState, '', currentHash);
    isBackTriggeredRef.current = false;

    const handlePopState = () => {
      // When back button is pressed, dismiss the modal
      isBackTriggeredRef.current = true;
      if (typeof onCloseRef.current === 'function') {
        onCloseRef.current();
      }
    };

    window.addEventListener('popstate', handlePopState, { once: true });

    return () => {
      window.removeEventListener('popstate', handlePopState);
      // If closed by user clicking an on-screen button (Save/Cancel/Close/X)
      // pop the pushed modal entry from history so user doesn't have a dead back click,
      // but only if the user hasn't already navigated to a different screen/hash
      if (!isBackTriggeredRef.current && window.history.state?.modalKey === modalKey) {
        if (window.location.hash === currentHash) {
          window.history.back();
        }
      }
    };
  }, [isOpen]);
}

export default useModalBackHandler;

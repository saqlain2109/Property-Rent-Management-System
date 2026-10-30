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

    // Guard: ignore popstate events during initial mount or React StrictMode cleanup cycles
    let isArmed = false;
    const armTimer = setTimeout(() => {
      isArmed = true;
    }, 100);

    const handlePopState = (e) => {
      if (!isArmed) return;
      // When back button is pressed, dismiss the modal
      isBackTriggeredRef.current = true;
      if (typeof onCloseRef.current === 'function') {
        onCloseRef.current();
      }
    };

    window.addEventListener('popstate', handlePopState, { once: true });

    return () => {
      clearTimeout(armTimer);
      window.removeEventListener('popstate', handlePopState);
      // Clean up modal state in history without calling window.history.back()
      // Calling history.back() inside unmount causes asynchronous popstate races in React 18 / StrictMode
      if (!isBackTriggeredRef.current && window.history.state?.modalKey === modalKey) {
        if (window.location.hash === currentHash) {
          window.history.replaceState({ modalOpen: false }, '', currentHash);
        }
      }
    };
  }, [isOpen]);
}

export default useModalBackHandler;

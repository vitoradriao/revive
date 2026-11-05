import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { glassSurface } from '../../utils/constants';

const ConfirmModal = ({ isOpen, onClose, onConfirm, title, message }) => {
  const dialog = useRef(null), cancel = useRef(null);
  useEffect(() => {
    if (!isOpen) return;
    const previous = document.activeElement;
    dialog.current?.showModal?.(); cancel.current?.focus();
    return () => previous?.focus();
  }, [isOpen]);
  if (!isOpen) return null;
  return <dialog ref={dialog} aria-labelledby="confirmation-title" aria-describedby="confirmation-message" onCancel={onClose}
    onKeyDown={event => {
      if (event.key !== 'Tab') return;
      const buttons = [...event.currentTarget.querySelectorAll('button')];
      const first = buttons[0], last = buttons.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }} className={`${glassSurface} text-app rounded-[30px] max-w-md w-full p-6 backdrop:bg-black/60`}>
    <div className="flex items-start justify-between gap-4 mb-2">
      <h3 id="confirmation-title" className="text-2xl font-black tracking-[-0.05em] text-app">{title}</h3>
      <button type="button" aria-label="Fechar confirmação" onClick={onClose} className="p-2 text-muted hover:text-app rounded-xl"><X className="w-4 h-4" /></button>
    </div>
    <p id="confirmation-message" className="text-muted mb-6 leading-relaxed">{message}</p>
    <div className="flex gap-3 justify-end">
      <button ref={cancel} type="button" onClick={onClose} className="btn-secondary px-4 py-2">Cancelar</button>
      <button type="button" onClick={onConfirm} className="btn-danger px-4 py-2">Confirmar</button>
    </div>
  </dialog>;
};
export default ConfirmModal;

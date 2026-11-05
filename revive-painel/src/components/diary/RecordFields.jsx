import React, { useId } from 'react';
import { recordFields, recordLimits } from '../../utils/diary';
import { fieldBase } from '../../utils/constants';

export default function RecordFields({ values, onChange, quick = false, editing = false, readOnly = false }) {
    const prefix = useId();
    return Object.entries(recordFields).filter(([key]) => !quick || key === 'humor').map(([key, label]) => <div key={key} className="space-y-2">
        <label htmlFor={prefix + key} className="block font-semibold">{label}</label>
        <textarea id={prefix + key} className={fieldBase} rows={key === 'humor' ? 1 : 3}
            value={values[key]} readOnly={readOnly} onChange={event => onChange(key, event.target.value)}
            aria-describedby={prefix + key + '-limit'} />
        <p id={prefix + key + '-limit'} className="text-sm text-muted">Até {recordLimits[key]} caracteres{editing ? ' ao alterar este campo. Conteúdo antigo permanece completo.' : '.'}</p>
    </div>);
}

const FormSelect = ({ label, name, value, onChange, children, disabled }) => (
    <div className="flex flex-col">
        <label className="text-xs text-slate-500 mb-1">{label}</label>
        <select disabled={disabled} name={name} value={value} onChange={onChange} className={`rounded p-2 text-sm outline-none bg-white border border-slate-300 text-slate-800 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 w-full ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}>
            {children}
        </select>
    </div>
);

export default FormSelect;

const FormInput = ({ label, name, value, onChange, mb = "mb-0" }) => (
    <div className={`flex flex-col ${mb}`}>
        <label className="text-xs text-slate-500 mb-1">{label}</label>
        <input type="text" name={name} value={value} onChange={onChange} className="rounded p-2 text-sm outline-none bg-white border border-slate-300 text-slate-800 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 w-full" />
    </div>
);

export default FormInput;

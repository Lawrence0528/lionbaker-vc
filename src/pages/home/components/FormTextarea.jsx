const FormTextarea = ({ label, name, value, onChange, h = "h-24", mb = "mb-0", placeholder }) => (
    <div className={`flex flex-col ${mb}`}>
        <label className="text-xs text-slate-500 mb-1">{label}</label>
        <textarea name={name} value={value} onChange={onChange} placeholder={placeholder} className={`rounded p-2 text-sm outline-none resize-none bg-white border border-slate-300 text-slate-800 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 w-full ${h}`} />
    </div>
);

export default FormTextarea;

import React from 'react';
import ProjectCard from './ProjectCard';

const ProjectList = ({ projects, onCreate, onEdit, onDelete, onViewFormResponses, userProfile }) => (
    <div className="w-full max-w-5xl space-y-6">
        <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold text-emerald-500">我的專案列表</h2>
            <button
                onClick={onCreate}
                className="px-6 py-2 bg-emerald-500 text-white shadow-md shadow-emerald-500/20 font-bold rounded-lg hover:brightness-110 transition shadow-[0_0_15px_rgba(var(--theme-accent-rgb),0.5)]"
            >
                + 新增專案
            </button>
        </div>

        {projects.length === 0 ? (
            <div className="text-center py-12 bg-white border border-slate-200 shadow-xl rounded-xl text-slate-500">目前沒有專案，按右上角新增！</div>
        ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {projects.map((p) => (
                    <ProjectCard key={p.id} project={p} onEdit={onEdit} onDelete={onDelete} onViewFormResponses={onViewFormResponses} userProfile={userProfile} />
                ))}
            </div>
        )}
    </div>
);

export default ProjectList;

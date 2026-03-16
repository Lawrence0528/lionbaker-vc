import React, { useState } from 'react';
import { useAgentData } from './hooks/useAgentData';
import { useDeploy } from './hooks/useDeploy';
import AgentNav from './components/AgentNav';
import AgentList from './components/AgentList';
import AgentEdit from './components/AgentEdit';
import SkillList from './components/SkillList';
import SkillEdit from './components/SkillEdit';

/**
 * LINE Bot Agent 後台管理：機器人管理 + 技能市集＆工作坊
 */
const AgentAdmin = () => {
    const [mainView, setMainView] = useState('agents');
    const [viewMode, setViewMode] = useState('list');
    const [skillViewMode, setSkillViewMode] = useState('list');
    const [editTab, setEditTab] = useState('settings');
    const [currentAgent, setCurrentAgent] = useState(null);
    const [currentSkill, setCurrentSkill] = useState(null);
    const [shareCodeInput, setShareCodeInput] = useState('');

    const {
        userProfile,
        agents,
        skills,
        publicSkills,
        setPublicSkills,
        uploadingImageIndex,
        handleCreateAgent,
        handleSaveAgent,
        handleDeleteAgent,
        handleCreateSkill,
        handleSaveSkill,
        handleDeleteSkill,
        handleImageUpload,
        handleRemoveImage,
        handleAddByShareCode,
    } = useAgentData();

    const { isDeploying, deployStatus, runDeploy } = useDeploy(currentAgent, setCurrentAgent);

    const toggleMountSkill = (skillId) => {
        if (!currentAgent) return;
        const prevMounted = currentAgent.mountedSkills || [];
        const newMounted = prevMounted.includes(skillId)
            ? prevMounted.filter((id) => id !== skillId)
            : [...prevMounted, skillId];
        setCurrentAgent({ ...currentAgent, mountedSkills: newMounted });
    };

    const onAddByShareCode = async () => {
        const result = await handleAddByShareCode(shareCodeInput, currentAgent, setCurrentAgent);
        if (result?.clearInput) setShareCodeInput('');
    };

    const handleEditAgent = (ag) => {
        setCurrentAgent(ag);
        setViewMode('edit');
        setEditTab(!ag.lineToken || !ag.cfAccountId ? 'settings' : 'skills');
    };

    const handleCreateAgentClick = async () => {
        const { newDoc, success } = await handleCreateAgent();
        if (success && newDoc) {
            setCurrentAgent(newDoc);
            setViewMode('edit');
            setEditTab('settings');
        }
    };

    const handleDeleteAgentClick = async (id) => {
        const { deleted } = await handleDeleteAgent(id);
        if (deleted && currentAgent?.id === id) setViewMode('list');
    };

    const handleCreateSkillClick = async () => {
        const { newDoc, success } = await handleCreateSkill();
        if (success && newDoc) {
            setCurrentSkill(newDoc);
            setSkillViewMode('edit');
        }
    };

    const handleDeleteSkillClick = async (id) => {
        const { deleted } = await handleDeleteSkill(id);
        if (deleted && currentSkill?.id === id) setSkillViewMode('list');
    };

    const showNav = viewMode === 'list' && skillViewMode === 'list';

    return (
        <div className="w-full flex flex-col items-center">
            {showNav && <AgentNav mainView={mainView} setMainView={setMainView} />}

            {mainView === 'agents' && (
                <div className="w-full max-w-4xl mx-auto">
                    {viewMode === 'list' && (
                        <AgentList
                            agents={agents}
                            onCreate={handleCreateAgentClick}
                            onEdit={handleEditAgent}
                            onDelete={handleDeleteAgentClick}
                        />
                    )}
                    {viewMode === 'edit' && currentAgent && (
                        <AgentEdit
                            currentAgent={currentAgent}
                            setCurrentAgent={setCurrentAgent}
                            editTab={editTab}
                            setEditTab={setEditTab}
                            setViewMode={setViewMode}
                            skills={skills}
                            publicSkills={publicSkills}
                            setPublicSkills={setPublicSkills}
                            shareCodeInput={shareCodeInput}
                            setShareCodeInput={setShareCodeInput}
                            onAddByShareCode={onAddByShareCode}
                            onToggleMount={toggleMountSkill}
                            onSave={handleSaveAgent}
                            handleImageUpload={handleImageUpload}
                            handleRemoveImage={handleRemoveImage}
                            uploadingImageIndex={uploadingImageIndex}
                            isDeploying={isDeploying}
                            deployStatus={deployStatus}
                            runDeploy={runDeploy}
                        />
                    )}
                </div>
            )}

            {mainView === 'skills' && (
                <div className="w-full max-w-4xl mx-auto">
                    {skillViewMode === 'list' && (
                        <SkillList
                            skills={skills}
                            onCreate={handleCreateSkillClick}
                            onEdit={(sk) => {
                                setCurrentSkill(sk);
                                setSkillViewMode('edit');
                            }}
                            onDelete={handleDeleteSkillClick}
                        />
                    )}
                    {skillViewMode === 'edit' && currentSkill && (
                        <SkillEdit
                            currentSkill={currentSkill}
                            setCurrentSkill={setCurrentSkill}
                            onBack={() => setSkillViewMode('list')}
                            onSave={handleSaveSkill}
                            handleImageUpload={handleImageUpload}
                            handleRemoveImage={handleRemoveImage}
                            uploadingImageIndex={uploadingImageIndex}
                        />
                    )}
                </div>
            )}
        </div>
    );
};

export default AgentAdmin;

import { useState, useEffect, useCallback } from 'react';
import { db, signIn, storage } from '../../../firebase';
import {
    collection,
    getDocs,
    getDoc,
    doc,
    setDoc,
    deleteDoc,
    query,
    where,
    serverTimestamp,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import liff from '@line/liff';
import { PRESET_SCRIPTS, generateShareCode } from '../constants';

/**
 * Agent 與 Skill 的資料管理、LIFF 登入、CRUD、圖片上傳
 */
export const useAgentData = () => {
    const [userProfile, setUserProfile] = useState(null);
    const [agents, setAgents] = useState([]);
    const [skills, setSkills] = useState([]);
    const [publicSkills, setPublicSkills] = useState([]);
    const [uploadingImageIndex, setUploadingImageIndex] = useState(null);

    const initAuth = useCallback(async () => {
        await signIn();
        if (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
            await liff.init({ liffId: '2008893070-nnNXBPod' });
            if (liff.isLoggedIn()) {
                const profile = await liff.getProfile();
                setUserProfile(profile);
                return profile.userId;
            }
            liff.login();
            return null;
        }
        const localUser = { userId: 'Ue17ac074742b4f21da6f6b41307a246a', displayName: 'Local User' };
        setUserProfile(localUser);
        return localUser.userId;
    }, []);

    const fetchAgents = useCallback(async (userId) => {
        try {
            const q = query(collection(db, 'agents'), where('userId', '==', userId));
            const snap = await getDocs(q);
            const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
            data.sort((a, b) => (b.updatedAt?.seconds || 0) - (a.updatedAt?.seconds || 0));
            setAgents(data);
        } catch (e) {
            console.error('Fetch agents error', e);
        }
    }, []);

    const fetchSkills = useCallback(async (userId) => {
        try {
            const q = query(collection(db, 'skills'), where('userId', '==', userId));
            const snap = await getDocs(q);
            const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
            data.sort((a, b) => (b.updatedAt?.seconds || 0) - (a.updatedAt?.seconds || 0));
            setSkills(data);
        } catch (e) {
            console.error('Fetch skills error', e);
        }
    }, []);

    const fetchPublicSkills = useCallback(async () => {
        try {
            const q = query(collection(db, 'skills'), where('isPublic', '==', true));
            const snap = await getDocs(q);
            const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
            setPublicSkills(data);
        } catch (e) {
            console.error('Fetch public skills error', e);
        }
    }, []);

    const fetchData = useCallback((userId) => {
        fetchAgents(userId);
        fetchSkills(userId);
        fetchPublicSkills();
    }, [fetchAgents, fetchSkills, fetchPublicSkills]);

    useEffect(() => {
        const init = async () => {
            try {
                const userId = await initAuth();
                if (userId) fetchData(userId);
            } catch (err) {
                console.error('初始化失敗:', err);
            }
        };
        init();
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // ========== Agents CRUD ==========
    const handleCreateAgent = useCallback(async () => {
        if (!userProfile) return;
        const newRef = doc(collection(db, 'agents'));
        const newDoc = {
            id: newRef.id,
            name: `我的機器人 ${agents.length + 1}`,
            userId: userProfile.userId,
            cfAccountId: '',
            cfApiToken: '',
            lineToken: '',
            lineSecret: '',
            mountedSkills: [],
            scripts: [{
                ...PRESET_SCRIPTS[0],
                replyTexts: [PRESET_SCRIPTS[0].reply],
                replyImages: [],
                id: Date.now().toString(),
            }],
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
        };
        try {
            await setDoc(newRef, newDoc);
            setAgents((prev) => [newDoc, ...prev]);
            return { newDoc, success: true };
        } catch (e) {
            alert('新增失敗');
            return { success: false };
        }
    }, [userProfile, agents.length]);

    const handleSaveAgent = useCallback(async (agent) => {
        try {
            const agentRef = doc(db, 'agents', agent.id);
            const updateData = { ...agent, updatedAt: serverTimestamp() };
            await setDoc(agentRef, updateData, { merge: true });
            setAgents((prev) => prev.map((a) => (a.id === agent.id ? updateData : a)));
            alert('機器人設定儲存成功！');
            return true;
        } catch (e) {
            alert('儲存失敗');
            return false;
        }
    }, []);

    const handleDeleteAgent = useCallback(async (id) => {
        if (!window.confirm('確定要刪除這個機器人嗎？')) return false;
        try {
            await deleteDoc(doc(db, 'agents', id));
            setAgents((prev) => prev.filter((a) => a.id !== id));
            return { deleted: true };
        } catch (e) {
            alert('刪除失敗');
            return { deleted: false };
        }
    }, []);

    // ========== Skills CRUD ==========
    const handleCreateSkill = useCallback(async () => {
        if (!userProfile) return;
        const newRef = doc(collection(db, 'skills'));
        const newDoc = {
            id: newRef.id,
            name: `新擴充技能 ${skills.length + 1}`,
            description: '描述你的擴充套件，這會幫助其他人了解。',
            userId: userProfile.userId,
            isPublic: false,
            shareCode: generateShareCode(),
            scripts: [{
                ...PRESET_SCRIPTS[0],
                replyTexts: [PRESET_SCRIPTS[0].reply],
                replyImages: [],
                id: Date.now().toString(),
            }],
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
        };
        try {
            await setDoc(newRef, newDoc);
            setSkills((prev) => [newDoc, ...prev]);
            return { newDoc, success: true };
        } catch (e) {
            alert('新增技能失敗');
            return { success: false };
        }
    }, [userProfile, skills.length]);

    const handleSaveSkill = useCallback(async (skill) => {
        try {
            const skillRef = doc(db, 'skills', skill.id);
            const updateData = { ...skill, updatedAt: serverTimestamp() };
            await setDoc(skillRef, updateData, { merge: true });
            setSkills((prev) => prev.map((s) => (s.id === skill.id ? updateData : s)));
            alert('技能儲存成功！');
            return true;
        } catch (e) {
            alert('儲存失敗');
            return false;
        }
    }, []);

    const handleDeleteSkill = useCallback(async (id) => {
        if (!window.confirm('確定要刪除這個擴充技能嗎？使用該代碼的使用者將失效')) return false;
        try {
            await deleteDoc(doc(db, 'skills', id));
            setSkills((prev) => prev.filter((s) => s.id !== id));
            return { deleted: true };
        } catch (e) {
            alert('刪除失敗');
            return { deleted: false };
        }
    }, []);

    // ========== 圖片上傳 ==========
    const handleImageUpload = useCallback(async (index, file, scripts, setScripts) => {
        if (!file || !userProfile) return;
        const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
        if (file.size >= MAX_UPLOAD_BYTES) {
            alert('檔案過大，請上傳 5MB 以內的圖片檔');
            return;
        }
        if (!file.type?.startsWith('image/')) {
            alert('僅支援上傳圖片檔（image/*）');
            return;
        }
        setUploadingImageIndex(index);
        try {
            const fileName = `${Date.now()}_${file.name}`;
            const fileRef = ref(storage, `agent_images/${userProfile.userId}/${fileName}`);
            await uploadBytes(fileRef, file);
            const url = await getDownloadURL(fileRef);

            const newScripts = [...scripts];
            if (!newScripts[index].replyImages) newScripts[index].replyImages = [];
            if (newScripts[index].imageUrl && newScripts[index].replyImages.length === 0) {
                newScripts[index].replyImages.push(newScripts[index].imageUrl);
                newScripts[index].imageUrl = null;
            }
            newScripts[index].replyImages.push(url);
            setScripts(newScripts);
        } catch (e) {
            console.error('上傳圖片失敗', e);
            alert('上傳圖片失敗，請確定您登入正常的開發者帳號。');
        } finally {
            setUploadingImageIndex(null);
        }
    }, [userProfile]);

    const handleRemoveImage = useCallback(async (scriptIndex, imageIndex, scripts, setScripts) => {
        const newScripts = [...scripts];
        const imageUrlToRemove = newScripts[scriptIndex].replyImages[imageIndex];
        newScripts[scriptIndex].replyImages.splice(imageIndex, 1);
        setScripts(newScripts);

        if (userProfile && imageUrlToRemove?.includes(userProfile.userId)) {
            try {
                await deleteObject(ref(storage, imageUrlToRemove));
            } catch (error) {
                console.warn('檔案在雲端已不存在或無權刪除', error);
            }
        }
    }, [userProfile]);

    // ========== 分享代碼掛載技能 ==========
    const handleAddByShareCode = useCallback(async (shareCode, currentAgent, setCurrentAgent) => {
        if (!shareCode?.trim()) return { success: false };
        try {
            const q = query(collection(db, 'skills'), where('shareCode', '==', shareCode.trim().toUpperCase()));
            const snap = await getDocs(q);
            if (snap.empty) {
                alert('查無此分享代碼！');
                return { success: false };
            }
            const skillDoc = snap.docs[0];
            const skillId = skillDoc.id;
            const prevMounted = currentAgent?.mountedSkills || [];
            if (prevMounted.includes(skillId)) {
                alert('這個技能已經掛載囉！');
                return { success: false };
            }
            setCurrentAgent((prev) => ({ ...prev, mountedSkills: [...(prev.mountedSkills || []), skillId] }));
            if (!publicSkills.some((s) => s.id === skillId) && !skills.some((s) => s.id === skillId)) {
                setPublicSkills((prev) => [...prev, { id: skillId, ...skillDoc.data() }]);
            }
            alert(`已成功掛載技能：${skillDoc.data().name}`);
            return { success: true, clearInput: true };
        } catch (e) {
            alert('查詢失敗');
            return { success: false };
        }
    }, [publicSkills, skills]);

    return {
        userProfile,
        agents,
        skills,
        publicSkills,
        uploadingImageIndex,
        setAgents,
        setSkills,
        setPublicSkills,
        fetchData,
        fetchAgents,
        handleCreateAgent,
        handleSaveAgent,
        handleDeleteAgent,
        handleCreateSkill,
        handleSaveSkill,
        handleDeleteSkill,
        handleImageUpload,
        handleRemoveImage,
        handleAddByShareCode,
    };
};

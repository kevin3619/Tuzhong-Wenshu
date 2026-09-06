'use client'

// 🔍 第18轮开发自验页（内部测试用，不进导航）
// 用途：以真实 StepCharacters 组件渲染三套阵容（单女主/双女主/后宫·多女主）
// 的「全 15 人落地后状态」，供 puppeteer 真渲断言卡片数量与定位徽标。

import { useState } from 'react'
import StepCharacters from '@/components/wizard-steps/StepCharacters'

type AnyChar = Record<string, unknown>

function mk(name: string, role: string, gender: string, identity: string): AnyChar {
  return {
    id: 'mock-' + name, name, role, gender, age: '28',
    identity, appearance: '—', personality: '—', growthArc: '—', motivation: '—',
    skills: ['技能一', '技能二'], attributes: { strength: 60, intelligence: 60, command: 60, politics: 60, charm: 60 },
  }
}

// 三套状态 = 各模式 3 批全部落地并经 applyCharBatch 合并后的形态
const STATES: Record<string, AnyChar> = {
  single: {
    protagonist: mk('林渊', '主角', '男', '寒门子弟，觉醒上古传承'),
    femaleLead: mk('苏清霜', '女主', '女', '宗门圣女，冰系天才'),
    antagonist: mk('墨渊', '反派', '男', '幕后黑手，前朝余孽'),
    supporting: [
      mk('血手屠', '反派', '男', '前期反派，黑市枭雄'),
      mk('鬼面郎', '反派', '男', '中期反派，杀手组织首座'),
      mk('玄阴老祖', '反派', '男', '后期大反派，魔道巨擘'),
      mk('石破军', '朋友', '男', '主角结义兄弟，憨直武痴'),
      mk('柳云飞', '朋友', '男', '主角挚友，情报贩子'),
      mk('叶璃', '女配', '女', '师长之女，医道传人'),
      mk('洛轻语', '女配', '女', '派系女子，琴心妙人'),
      mk('陈老', '配角', '男', '主角亲信长老'),
      mk('秦无衣', '配角', '男', '盟友，游侠首领'),
      mk('周通', '配角', '男', '部属，斥候统领'),
      mk('何掌柜', '配角', '男', '商会会长，后勤总管'),
      mk('白芷', '配角', '女', '情报人员，百晓生传人'),
    ],
  },
  dual: {
    protagonist: mk('林渊', '主角', '男', '寒门子弟，觉醒上古传承'),
    femaleLead: mk('苏清霜', '女主', '女', '宗门圣女，与主角初期对立'),
    antagonist: mk('墨渊', '反派', '男', '幕后黑手，前朝余孽'),
    supporting: [
      mk('云曦', '女主2', '女', '主角早期同伴，温暖治愈系'),
      mk('血手屠', '反派', '男', '前期反派，黑市枭雄'),
      mk('鬼面郎', '反派', '男', '中期反派，杀手组织首座'),
      mk('玄阴老祖', '反派', '男', '后期大反派，魔道巨擘'),
      mk('万蛊真人', '反派', '男', '隐藏反派，伪装盟友'),
      mk('石破军', '朋友', '男', '主角结义兄弟，憨直武痴'),
      mk('柳云飞', '朋友', '男', '主角挚友，情报贩子'),
      mk('叶璃', '女配', '女', '重要女性配角但非女主'),
      mk('陈老', '配角', '男', '主角亲信长老'),
      mk('秦无衣', '配角', '男', '盟友，游侠首领'),
      mk('周通', '配角', '男', '部属，斥候统领'),
      mk('何掌柜', '配角', '男', '商会会长，后勤总管'),
    ],
  },
  harem: {
    protagonist: mk('林渊', '主角', '男', '寒门子弟，觉醒上古传承'),
    femaleLead: mk('苏清霜', '女主', '女', '第一女主，宗门圣女'),
    antagonist: mk('墨渊', '反派', '男', '幕后黑手，前朝余孽'),
    supporting: [
      mk('云曦', '女主2', '女', '第二女主，医谷传人'),
      mk('洛红绡', '女主3', '女', '第三女主，魔教圣女'),
      mk('白汐', '女主4', '女', '第四女主，神秘船夫'),
      mk('血手屠', '反派', '男', '前期反派，黑市枭雄'),
      mk('鬼面郎', '反派', '男', '中期反派，杀手组织首座'),
      mk('玄阴老祖', '反派', '男', '后期大反派，魔道巨擘'),
      mk('陈老', '配角', '男', '主角亲信长老'),
      mk('秦无衣', '配角', '男', '盟友，游侠首领'),
      mk('周通', '配角', '男', '部属，斥候统领'),
      mk('何掌柜', '配角', '男', '商会会长，后勤总管'),
      mk('白芷', '配角', '女', '情报人员，百晓生传人'),
      mk('段书生', '配角', '男', '谋主，落第举人'),
    ],
  },
}

const MODE_LABEL: Record<string, string> = { single: '单女主', dual: '双女主', harem: '后宫·多女主' }

function MockSection({ mode }: { mode: string }) {
  const [data, setData] = useState<AnyChar>(STATES[mode])
  return (
    <section data-mode={mode} style={{ marginBottom: 48 }}>
      <h2 style={{ fontSize: 22, fontWeight: 700, padding: '8px 0' }}>
        【{MODE_LABEL[mode]}】共 {(data.protagonist ? 1 : 0) + (data.femaleLead ? 1 : 0) + (data.antagonist ? 1 : 0) + (data.supporting as AnyChar[]).length} 人
      </h2>
      <StepCharacters
        data={data as never}
        onChange={setData}
        onRegenerate={() => {}}
        onGenerate={() => {}}
        onRegenerateAll={() => {}}
        isLoading={false}
        isGenerating={false}
        regeneratePrompt=""
        setRegeneratePrompt={() => {}}
        RegenButton={function () { return null }}
        createEmptyCharacter={(role: string) => mk('', role, '', '')}
        appendRoleInput=""
        setAppendRoleInput={() => {}}
        regeneratingField={null}
        stepName={'characters-' + mode}
      />
    </section>
  )
}

export default function DevTestCharactersPage() {
  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: 24 }}>
      <h1 style={{ fontSize: 26, fontWeight: 800, marginBottom: 8 }}>主要人物设定 · 三套阵容真渲自验</h1>
      <p style={{ color: '#666', marginBottom: 24 }}>单女主 1+1+2+2+4+5=15 ｜ 双女主 1+2+1+2+5+4=15 ｜ 后宫 1+4+4+6=15</p>
      <MockSection mode="single" />
      <MockSection mode="dual" />
      <MockSection mode="harem" />
    </div>
  )
}

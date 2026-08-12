<script setup lang="ts">
import { RefreshCw } from 'lucide-vue-next'
import type { ApiSuccess } from '~/types/api'
import type { PricingReference } from '~/types/pricing'

const site = useSiteConfigState()
useSeoMeta({
  title: '模型价格参考',
  description: () => `查看${site.value.project_name}模型官方价格、分组人民币与额度折扣，以及图片模型按次价格。`,
})

const { data, pending, error, refresh } = await useFetch<ApiSuccess<PricingReference>>('/api/pricing')
const reference = computed(() => data.value?.data || null)
const sourceLabel = computed(() => {
  if (reference.value?.source.status === 'live') return '已同步主站价格'
  if (reference.value?.source.status === 'partial') return '部分数据已同步'
  return '数据源待配置'
})
</script>

<template>
  <div class="tool-page pricing-page">
    <div class="tool-page__inner">
      <ToolPageHeading eyebrow="价格参考" title="模型价格参考" description="文本模型展示官方单价和分组折扣；图片模型按分辨率展示每张折算价格，实际扣费以主站账单为准。">
        <template #actions>
          <span v-if="reference" :class="['source-status', `source-status--${reference.source.status}`]">{{ sourceLabel }}</span>
          <button class="icon-button" type="button" title="刷新价格" :disabled="pending" @click="refresh()">
            <RefreshCw :size="17" :class="{ spinning: pending }" />
          </button>
        </template>
      </ToolPageHeading>

      <div v-if="pending && !reference" class="loading-band">正在读取模型价格...</div>
      <div v-else-if="error" class="tool-alert tool-alert--error">{{ error.message || '模型价格读取失败' }}</div>
      <template v-else-if="reference">
        <div v-if="reference.source.warnings?.length" class="tool-alert">
          {{ reference.source.warnings.join(' ') }}
        </div>
        <PricingExplorer :reference="reference" />
      </template>
    </div>
  </div>
</template>

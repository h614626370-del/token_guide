<script setup lang="ts">
const props = defineProps<{
  contentPath: string
  section: string
}>()

const site = useSiteConfigState()
const contentPath = computed(() => props.contentPath)
const { data: page } = await useAsyncData(() => `guide:${contentPath.value}`, () => {
  return queryCollection('guides').path(contentPath.value).first()
})
const { data: databasePage } = await useAsyncData(() => `guide-override:${contentPath.value}`, async () => {
  const response = await $fetch<{ ok: true, data: { title: string, description: string, body: string } | null }>('/api/docs', {
    query: { path: contentPath.value },
  })
  return response.data
})

if (!page.value) {
  throw createError({ statusCode: 404, statusMessage: 'Guide page not found' })
}

const renderedPage = computed(() => rewriteContent(page.value))
const databaseBody = computed(() => databasePage.value ? replaceDefaults(databasePage.value.body) : '')
const pageTitle = computed(() => databasePage.value?.title ? replaceDefaults(databasePage.value.title) : renderedPage.value?.title || props.section)
const pageDescription = computed(() => databasePage.value ? replaceDefaults(databasePage.value.description) : renderedPage.value?.description || '')

function rewriteContent<T>(value: T): T {
  if (typeof value === 'string') return replaceDefaults(value) as T
  if (Array.isArray(value)) return value.map(item => rewriteContent(item)) as T
  if (!value || typeof value !== 'object') return value

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, rewriteContent(item)]),
  ) as T
}

function replaceDefaults(value: string) {
  const replacements: Record<string, string> = {
    'https://www.kdocs.cn/l/csU8ZJybJe2V': site.value.support_group_url,
    'https://kkflow.org/v1': site.value.api_base_url,
    'https://kkflow.org': site.value.main_site_url,
    'Token向云': site.value.project_name,
    'kkflow520': site.value.support_wechat,
  }

  return value.replace(
    /https:\/\/www\.kdocs\.cn\/l\/csU8ZJybJe2V|https:\/\/kkflow\.org\/v1|https:\/\/kkflow\.org|Token向云|kkflow520/g,
    token => replacements[token] ?? token,
  )
}

useSeoMeta({
  title: () => pageTitle.value,
  description: () => pageDescription.value,
})
</script>

<template>
  <article class="page-shell doc-content">
    <MDC
      v-if="databasePage"
      :value="databaseBody"
      :data="{
        projectName: site.project_name,
        siteTitle: site.site_title,
        mainSiteUrl: site.main_site_url,
        apiBaseUrl: site.api_base_url,
      }"
    />
    <ContentRenderer
      v-else-if="renderedPage"
      :value="renderedPage"
      :data="{
        projectName: site.project_name,
        siteTitle: site.site_title,
        mainSiteUrl: site.main_site_url,
        apiBaseUrl: site.api_base_url,
      }"
    />
  </article>
</template>

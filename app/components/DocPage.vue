<script setup lang="ts">
import { replaceGuideDefaults } from '#shared/utils/guide-content'

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
const databaseBody = computed(() => databasePage.value ? replaceGuideDefaults(databasePage.value.body, site.value) : '')
const pageTitle = computed(() => databasePage.value?.title ? replaceGuideDefaults(databasePage.value.title, site.value) : renderedPage.value?.title || props.section)
const pageDescription = computed(() => databasePage.value ? replaceGuideDefaults(databasePage.value.description, site.value) : renderedPage.value?.description || '')

function rewriteContent<T>(value: T): T {
  if (typeof value === 'string') return replaceGuideDefaults(value, site.value) as T
  if (Array.isArray(value)) return value.map(item => rewriteContent(item)) as T
  if (!value || typeof value !== 'object') return value

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, rewriteContent(item)]),
  ) as T
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

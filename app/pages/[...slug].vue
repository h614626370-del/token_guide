<script setup lang="ts">
const route = useRoute()
const site = useSiteConfigState()
definePageMeta({ guideDoc: true })

const contentPath = computed(() => {
  const value = route.params.slug
  const segments = Array.isArray(value) ? value : value ? [value] : []
  return `/${segments.join('/')}`
})

const { data: document } = await useAsyncData(
  () => `custom-guide:${contentPath.value}`,
  () => $fetch<{ ok: true, data: { title: string, description: string, body: string } | null }>('/api/docs', {
    query: { path: contentPath.value },
  }).then(response => response.data),
)

if (!document.value) {
  throw createError({ statusCode: 404, statusMessage: 'Guide page not found' })
}

const renderedBody = computed(() => replaceGuideDefaults(document.value?.body || '', site.value))
const renderedTitle = computed(() => replaceGuideDefaults(document.value?.title || '', site.value))
const renderedDescription = computed(() => replaceGuideDefaults(document.value?.description || '', site.value))

useSeoMeta({
  title: () => renderedTitle.value,
  description: () => renderedDescription.value,
})
</script>

<template>
  <article class="page-shell doc-content">
    <MDC :value="renderedBody" />
  </article>
</template>

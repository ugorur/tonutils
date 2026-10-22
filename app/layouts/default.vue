<template>
  <div class="flex min-h-dvh flex-col">
    <a href="#main" class="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-primary focus:px-3 focus:py-2 focus:text-inverted">Skip to content</a>
    <AppHeader />
    <main id="main" class="flex-1">
      <slot />
    </main>
    <AppFooter />
  </div>
</template>

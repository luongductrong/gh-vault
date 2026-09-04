<script lang="ts">
	import './layout.css';
	import { dev } from '$app/environment';
	import { Toaster } from '$lib/components/ui/sonner';
	import { QueryClient, QueryClientProvider } from '@tanstack/svelte-query';

	let { children } = $props();

	const queryClient = new QueryClient({
		defaultOptions: {
			queries: {
				staleTime: 1000 * 60 * 5, // 5 minutes
				refetchOnWindowFocus: false,
				retry: false
			}
		}
	});
</script>

<QueryClientProvider client={queryClient}>
	{@render children()}
	<Toaster position="bottom-right" richColors />
	{#if dev}
		{#await import('@tanstack/svelte-query-devtools') then { SvelteQueryDevtools }}
			<SvelteQueryDevtools initialIsOpen={false} />
		{/await}
	{/if}
</QueryClientProvider>

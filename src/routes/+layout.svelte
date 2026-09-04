<script lang="ts">
	import './layout.css';
	import { QueryClient, QueryClientProvider } from '@tanstack/svelte-query';
	import { Toaster } from '$lib/components/ui/sonner';

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
</QueryClientProvider>

<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { fetchApi } from '$lib/api';
	import { goto } from '$app/navigation';
	import { toast } from 'svelte-sonner';
	import { createMutation } from '@tanstack/svelte-query';

	let { children } = $props();

	const logoutMutation = createMutation(() => ({
		mutationFn: async () => {
			return fetchApi('/auth/logout', { method: 'POST' });
		},
		onSuccess: () => {
			goto('/login');
		},
		onError: () => {
			toast.error('Failed to logout');
			// Force redirect anyway
			goto('/login');
		}
	}));

	function handleLogout() {
		logoutMutation.mutate();
	}
</script>

<div class="flex min-h-screen flex-col bg-background text-foreground">
	<header
		class="sticky top-0 z-10 w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60"
	>
		<div class="container mx-auto flex h-14 items-center justify-between px-4 md:px-6">
			<a href="/" class="flex items-center gap-2 font-bold tracking-tight text-primary">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					width="24"
					height="24"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
					class="lucide lucide-box"
					><path
						d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"
					/><polyline points="3.27 6.96 12 12.01 20.73 6.96" /><line
						x1="12"
						x2="12"
						y1="22.08"
						y2="12"
					/></svg
				>
				<span>gh-vault</span>
			</a>
			<nav class="flex items-center gap-4">
				<Button
					variant="ghost"
					size="sm"
					onclick={handleLogout}
					disabled={logoutMutation.isPending}
				>
					Logout
				</Button>
			</nav>
		</div>
	</header>

	<main class="flex-1">
		{@render children()}
	</main>
</div>

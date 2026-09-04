<script lang="ts">
	import { Box } from '@lucide/svelte';

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
		class="sticky top-0 z-10 w-full border-b border-border bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/60"
	>
		<div class="container mx-auto flex h-14 items-center justify-between px-4 md:px-6">
			<a href="/" class="flex items-center gap-2 font-bold tracking-tight text-primary">
				<Box size={24} />
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

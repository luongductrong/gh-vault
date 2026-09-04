<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import * as Card from '$lib/components/ui/card';
	import { fetchApi } from '$lib/api';
	import { createMutation } from '@tanstack/svelte-query';
	import { toast } from 'svelte-sonner';
	import { goto } from '$app/navigation';
	import { z } from 'zod';

	let password = $state('');
	let errorMsg = $state('');

	const loginSchema = z.object({
		password: z.string().min(1, 'Password is required')
	});

	const loginMutation = createMutation(() => ({
		mutationFn: async (pwd: string) => {
			return fetchApi('/auth/login', {
				method: 'POST',
				body: JSON.stringify({ password: pwd })
			});
		},
		onSuccess: () => {
			toast.success('Logged in successfully');
			goto('/');
		},
		onError: (error: any) => {
			errorMsg = error.message || 'Login failed';
			toast.error(errorMsg);
		}
	}));

	function handleSubmit(e: Event) {
		e.preventDefault();
		errorMsg = '';

		const result = loginSchema.safeParse({ password });
		if (!result.success) {
			errorMsg = result.error.issues[0].message;
			return;
		}

		loginMutation.mutate(password);
	}
</script>

<div class="flex min-h-screen items-center justify-center bg-background p-4">
	<Card.Root class="w-full max-w-[24rem]">
		<Card.Header>
			<Card.Title class="text-2xl font-bold">gh-vault</Card.Title>
			<Card.Description>Enter your admin password to continue.</Card.Description>
		</Card.Header>
		<Card.Content>
			<form onsubmit={handleSubmit} class="flex flex-col gap-6">
				<div class="flex flex-col gap-2">
					<Label for="password">Password</Label>
					<Input
						id="password"
						type="password"
						bind:value={password}
						disabled={loginMutation.isPending}
						placeholder="••••••••"
						autocomplete="current-password"
					/>
					{#if errorMsg}
						<p class="text-sm font-medium text-destructive">{errorMsg}</p>
					{/if}
				</div>
				<Button type="submit" disabled={loginMutation.isPending} class="w-full">
					{#if loginMutation.isPending}
						Logging in...
					{:else}
						Login
					{/if}
				</Button>
			</form>
		</Card.Content>
	</Card.Root>
</div>

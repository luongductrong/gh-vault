<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import {
		Card,
		CardContent,
		CardDescription,
		CardHeader,
		CardTitle
	} from '$lib/components/ui/card';
	import { fetchApi } from '$lib/api';
	import { createMutation } from '@tanstack/svelte-query';
	import { toast } from 'svelte-sonner';
	import { goto } from '$app/navigation';
	import { z } from 'zod';

	let username = $state('');
	let password = $state('');
	let errorMsg = $state('');

	const loginSchema = z.object({
		username: z.string().min(1, 'Username is required'),
		password: z.string().min(1, 'Password is required')
	});

	const loginMutation = createMutation(() => ({
		mutationFn: async (payload: { username: string; password: string }) => {
			return fetchApi('/auth/login', {
				method: 'POST',
				body: JSON.stringify(payload)
			});
		},
		onSuccess: () => {
			toast.success('Logged in successfully');
			goto('/');
		},
		onError: (error: Error) => {
			errorMsg = error.message || 'Login failed';
			toast.error(errorMsg);
		}
	}));

	function handleSubmit(e: Event) {
		e.preventDefault();
		errorMsg = '';

		const result = loginSchema.safeParse({ username, password });
		if (!result.success) {
			errorMsg = result.error.issues[0].message;
			return;
		}

		loginMutation.mutate({ username, password });
	}
</script>

<div class="flex min-h-screen items-center justify-center bg-background p-4">
	<Card class="w-full max-w-[24rem]">
		<CardHeader>
			<CardTitle class="text-2xl font-bold text-primary normal-case">gh-vault</CardTitle>
			<CardDescription>Enter your credentials to continue.</CardDescription>
		</CardHeader>
		<CardContent>
			<form onsubmit={handleSubmit} class="flex flex-col gap-6">
				<div class="flex flex-col gap-2">
					<Label for="username">Username</Label>
					<Input
						id="username"
						type="text"
						bind:value={username}
						disabled={loginMutation.isPending}
						placeholder="admin"
						autocomplete="username"
					/>
				</div>
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
		</CardContent>
	</Card>
</div>

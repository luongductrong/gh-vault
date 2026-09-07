<script lang="ts">
	import { FolderOpen } from '@lucide/svelte';
	import { fetchApi, formatBytes } from '$lib/api';
	import { createQuery, createMutation, useQueryClient } from '@tanstack/svelte-query';
	import {
		Card,
		CardContent,
		CardDescription,
		CardFooter,
		CardHeader,
		CardTitle
	} from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import {
		Dialog,
		DialogContent,
		DialogDescription,
		DialogFooter,
		DialogHeader,
		DialogTitle,
		DialogTrigger
	} from '$lib/components/ui/dialog';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { toast } from 'svelte-sonner';
	import { goto } from '$app/navigation';
	import { z } from 'zod';

	import type { Bucket } from '$lib/types';

	const queryClient = useQueryClient();

	const bucketsQuery = createQuery(() => ({
		queryKey: ['buckets'],
		queryFn: async () => {
			const res = await fetchApi<{ data: Bucket[]; total: number }>('/buckets');
			return res.data;
		}
	}));

	let isCreateOpen = $state(false);
	let newDisplayName = $state('');
	let createError = $state('');

	const createSchema = z.object({
		displayName: z.string().min(1, 'Display name is required').max(50, 'Max 50 characters')
	});

	const createMutationFn = createMutation(() => ({
		mutationFn: async (name: string) => {
			return fetchApi('/buckets', {
				method: 'POST',
				body: JSON.stringify({ display_name: name })
			});
		},
		onSuccess: () => {
			toast.success('Vault created successfully!');
			queryClient.invalidateQueries({ queryKey: ['buckets'] });
			isCreateOpen = false;
			newDisplayName = '';
			// Optionally navigate to the new bucket
			// goto(`/buckets/${newBucket.id}`);
		},
		onError: (error: Error) => {
			createError = error.message || 'Failed to create vault';
			toast.error(createError);
		}
	}));

	function handleCreateSubmit(e: Event) {
		e.preventDefault();
		createError = '';

		const result = createSchema.safeParse({ displayName: newDisplayName });
		if (!result.success) {
			createError = result.error.issues[0].message;
			return;
		}

		createMutationFn.mutate(newDisplayName);
	}
</script>

<div class="container mx-auto max-w-5xl space-y-8 p-4 md:p-6 lg:p-8">
	<div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
		<div>
			<h1 class="text-3xl font-bold tracking-tight">Your Vaults</h1>
			<p class="mt-1 text-muted-foreground">Manage your CDN storage buckets.</p>
		</div>

		<Dialog bind:open={isCreateOpen}>
			<DialogTrigger>
				{#snippet child({ props })}
					<Button {...props}>Create New Vault</Button>
				{/snippet}
			</DialogTrigger>
			<DialogContent class="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Create New Vault</DialogTitle>
					<DialogDescription>
						This will create a new GitHub repository under your account to store files.
					</DialogDescription>
				</DialogHeader>

				<form onsubmit={handleCreateSubmit} class="space-y-6 pt-4">
					<div class="space-y-2">
						<Label for="displayName">Display Name</Label>
						<Input
							id="displayName"
							placeholder="e.g. Blog Assets"
							bind:value={newDisplayName}
							disabled={createMutationFn.isPending}
							autocomplete="off"
						/>
						{#if createError}
							<p class="text-sm font-medium text-destructive">{createError}</p>
						{/if}
					</div>

					<DialogFooter>
						<Button
							type="button"
							variant="outline"
							onclick={() => (isCreateOpen = false)}
							disabled={createMutationFn.isPending}
						>
							Cancel
						</Button>
						<Button type="submit" disabled={createMutationFn.isPending}>
							{#if createMutationFn.isPending}
								Creating...
							{:else}
								Create Vault
							{/if}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	</div>

	{#if bucketsQuery.isPending}
		<div class="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
			{#each Array(3) as _, i (i)}
				<Card>
					<CardHeader class="space-y-2">
						<Skeleton class="h-5 w-1/2" />
						<Skeleton class="h-4 w-3/4" />
					</CardHeader>
					<CardContent>
						<Skeleton class="h-10 w-full" />
					</CardContent>
				</Card>
			{/each}
		</div>
	{:else if bucketsQuery.isError}
		<Card class="border-destructive/50 bg-destructive/10">
			<CardContent class="flex flex-col items-center justify-center p-10 text-center">
				<p class="mb-4 font-medium text-destructive">
					Error loading vaults: {bucketsQuery.error.message}
				</p>
				<Button variant="outline" onclick={() => bucketsQuery.refetch()}>Try Again</Button>
			</CardContent>
		</Card>
	{:else if bucketsQuery.data?.length === 0}
		<Card class="border-dashed">
			<CardContent
				class="flex flex-col items-center justify-center p-12 text-center text-muted-foreground"
			>
				<FolderOpen size={48} class="mb-4 opacity-50" />
				<h3 class="mb-1 text-lg font-semibold text-foreground">No Vaults Found</h3>
				<p class="mb-6 max-w-sm">
					You haven't created any vaults yet. Create your first vault to start uploading files.
				</p>
				<Button onclick={() => (isCreateOpen = true)}>Create New Vault</Button>
			</CardContent>
		</Card>
	{:else}
		<div class="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
			{#each bucketsQuery.data || [] as bucket (bucket.id)}
				<Card class="flex flex-col transition-colors hover:border-primary/50">
					<CardHeader>
						{#if bucket.provider === 'github'}
							<CardTitle class="truncate" title={bucket.displayName || bucket.githubRepoName || ''}>
								{bucket.displayName || bucket.githubRepoName}
							</CardTitle>
							<CardDescription class="truncate font-mono text-xs">
								{bucket.githubRepoName}
							</CardDescription>
						{:else}
							<CardTitle class="truncate" title="Cloudflare R2">
								{bucket.displayName || 'Cloudflare R2'}
							</CardTitle>
							<CardDescription class="truncate font-mono text-xs">
								R2 · {bucket.r2BucketName}
							</CardDescription>
						{/if}
					</CardHeader>
					<CardContent class="flex-1 space-y-4 text-sm">
						{#if bucket.provider === 'github'}
							<div class="flex justify-between border-b border-border pb-2">
								<span class="text-muted-foreground">Files</span>
								<span class="font-medium">{bucket.fileCount} / {bucket.maxFiles}</span>
							</div>
							<div class="flex justify-between border-b border-border pb-2">
								<span class="text-muted-foreground">Storage</span>
								<span class="font-medium"
									>{formatBytes(bucket.totalSizeBytes ?? 0)} /
									{formatBytes(bucket.maxSizeBytes ?? 0, 0)}</span
								>
							</div>
						{:else}
							<div class="flex justify-between border-b border-border pb-2">
								<span class="text-muted-foreground">Provider</span>
								<span class="font-medium">Cloudflare R2</span>
							</div>
							<div class="flex justify-between border-b border-border pb-2">
								<span class="text-muted-foreground">Storage</span>
								<span class="font-medium">Managed by R2</span>
							</div>
						{/if}
						<div class="flex justify-between">
							<span class="text-muted-foreground">Status</span>
							<span
								class="inline-flex items-center gap-1.5 font-medium {bucket.status === 'full'
									? 'text-destructive'
									: 'text-primary'}"
							>
								<span
									class="h-2 w-2 rounded-full {bucket.status === 'full'
										? 'bg-destructive'
										: 'bg-primary'}"
								></span>
								{bucket.status === 'full' ? 'Full' : 'Available'}
							</span>
						</div>
					</CardContent>
					<CardFooter>
						<Button
							variant="secondary"
							class="w-full"
							onclick={() => goto(`/buckets/${bucket.id}`)}
						>
							Open Vault
						</Button>
					</CardFooter>
				</Card>
			{/each}
		</div>
	{/if}
</div>

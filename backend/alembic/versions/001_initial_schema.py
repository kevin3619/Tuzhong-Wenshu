"""Initial schema creation

Revision ID: 001
Revises:
Create Date: 2026-05-29

"""
from alembic import op
import sqlalchemy as sa

revision = '001'
down_revision = None
branch_labels = None
depends_on = None

def upgrade() -> None:
    # Create users table
    op.create_table(
        'users',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('username', sa.String(50), nullable=False),
        sa.Column('email', sa.String(100), nullable=False),
        sa.Column('hashed_password', sa.String(255), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('username'),
        sa.UniqueConstraint('email')
    )
    op.create_index(op.f('ix_users_username'), 'users', ['username'])
    op.create_index(op.f('ix_users_email'), 'users', ['email'])
    
    # Create novels table
    op.create_table(
        'novels',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('user_id', sa.String(), nullable=False),
        sa.Column('title', sa.String(255), nullable=False),
        sa.Column('description', sa.Text()),
        sa.Column('content', sa.Text(), nullable=False, server_default=''),
        sa.Column('genre', sa.String(50)),
        sa.Column('status', sa.String(20), nullable=False, server_default='draft'),
        sa.Column('word_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('chapter_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(['user_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_novels_user_id'), 'novels', ['user_id'])
    
    # Create chapters table
    op.create_table(
        'chapters',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('novel_id', sa.String(), nullable=False),
        sa.Column('chapter_number', sa.Integer(), nullable=False),
        sa.Column('title', sa.String(255), nullable=False),
        sa.Column('outline', sa.Text()),
        sa.Column('content', sa.Text(), nullable=False, server_default=''),
        sa.Column('word_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('status', sa.String(20), nullable=False, server_default='draft'),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(['novel_id'], ['novels.id']),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_chapters_novel_id'), 'chapters', ['novel_id'])
    
    # Create characters table
    op.create_table(
        'characters',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('user_id', sa.String(), nullable=False),
        sa.Column('novel_id', sa.String()),
        sa.Column('name', sa.String(100), nullable=False),
        sa.Column('description', sa.Text()),
        sa.Column('personality', sa.Text()),
        sa.Column('background', sa.Text()),
        sa.Column('role', sa.String(50)),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(['user_id'], ['users.id']),
        sa.ForeignKeyConstraint(['novel_id'], ['novels.id']),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_characters_user_id'), 'characters', ['user_id'])
    op.create_index(op.f('ix_characters_novel_id'), 'characters', ['novel_id'])
    
    # Create world_settings table
    op.create_table(
        'world_settings',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('user_id', sa.String(), nullable=False),
        sa.Column('novel_id', sa.String()),
        sa.Column('name', sa.String(100), nullable=False),
        sa.Column('description', sa.Text()),
        sa.Column('rules', sa.Text()),
        sa.Column('history', sa.Text()),
        sa.Column('geography', sa.Text()),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(['user_id'], ['users.id']),
        sa.ForeignKeyConstraint(['novel_id'], ['novels.id']),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_world_settings_user_id'), 'world_settings', ['user_id'])
    op.create_index(op.f('ix_world_settings_novel_id'), 'world_settings', ['novel_id'])
    
    # Create novel_versions table (for version control)
    op.create_table(
        'novel_versions',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('novel_id', sa.String(), nullable=False),
        sa.Column('version_number', sa.Integer(), nullable=False),
        sa.Column('content', sa.Text(), nullable=False),
        sa.Column('description', sa.String(255)),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(['novel_id'], ['novels.id']),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_novel_versions_novel_id'), 'novel_versions', ['novel_id'])

def downgrade() -> None:
    op.drop_index(op.f('ix_novel_versions_novel_id'), table_name='novel_versions')
    op.drop_table('novel_versions')
    op.drop_index(op.f('ix_world_settings_novel_id'), table_name='world_settings')
    op.drop_index(op.f('ix_world_settings_user_id'), table_name='world_settings')
    op.drop_table('world_settings')
    op.drop_index(op.f('ix_characters_novel_id'), table_name='characters')
    op.drop_index(op.f('ix_characters_user_id'), table_name='characters')
    op.drop_table('characters')
    op.drop_index(op.f('ix_chapters_novel_id'), table_name='chapters')
    op.drop_table('chapters')
    op.drop_index(op.f('ix_novels_user_id'), table_name='novels')
    op.drop_table('novels')
    op.drop_index(op.f('ix_users_email'), table_name='users')
    op.drop_index(op.f('ix_users_username'), table_name='users')
    op.drop_table('users')
